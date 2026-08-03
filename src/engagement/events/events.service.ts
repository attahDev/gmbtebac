import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { BadgesService } from '../badges/badges.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService } from '../../uploads/uploads.service';
import { EventbriteService } from './eventbrite.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { NotificationCategory, EventSource, PostStatus } from '@prisma/client';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateCommunityEventDto } from './dto/create-community-event.dto';
import { UpdateCommunityEventDto } from './dto/update-community-event.dto';

/** Attendance.status values. Free-form string column in the DB (no enum),
 *  so keep the allowed values centralised here. */
export const ATTENDANCE_STATUS = {
  SAVED: 'SAVED',
  REGISTERED: 'REGISTERED',
} as const;

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private activityService: ActivityService,
    private notificationsService: NotificationsService,
    private uploadsService: UploadsService,
    private badgesService: BadgesService,
    private eventbriteService: EventbriteService,
    private realtime: RealtimeGateway,
  ) {}

  async findUpcoming(includeInactive = false, search?: string) {
    return this.prisma.event.findMany({
      where: {
        // Community submissions stay off every public listing until an
        // admin approves them — includeInactive is for admin tooling and
        // still shouldn't surface someone else's pending/rejected event.
        reviewStatus: PostStatus.APPROVED,
        ...(includeInactive
          ? {}
          : { isActive: true, isCompleted: false, startsAt: { gte: new Date() } }),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { location: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      // Featured first regardless of date, then soonest-first within each
      // group — an admin-pinned event should lead the dashboard even if a
      // closer, unfeatured event exists.
      orderBy: [{ isFeatured: 'desc' }, { startsAt: 'asc' }],
    });
  }

  /** Powers "View All Events" — the full archive, upcoming AND completed,
   *  minus anything the admin has soft-deleted. Unlike findUpcoming this
   *  never date-filters, since a completed/past event should still show
   *  up here even though it's dropped off the upcoming list. */
  /** "View All Events" — the public page's expand action. Deliberately
   *  excludes completed events: those move to the separate Past Events /
   *  Highlights section (findPastEvents), not this archive. */
  async findAll() {
    return this.prisma.event.findMany({
      where: { isActive: true, isCompleted: false, reviewStatus: PostStatus.APPROVED },
      orderBy: [{ isFeatured: 'desc' }, { startsAt: 'desc' }],
    });
  }

  /** "Our Past Events" / "Highlights from Previous Editions" on the public
   *  Events page. Most recent first, so the newest recap leads. */
  async findPastEvents() {
    return this.prisma.event.findMany({
      where: { isActive: true, isCompleted: true, reviewStatus: PostStatus.APPROVED },
      orderBy: { startsAt: 'desc' },
    });
  }

  /** Powers the Events dashboard tabs (Upcoming / Attended / Saved) and the
   *  stats row — replaces the hardcoded arrays that used to live in
   *  EventUI.tsx / EventStats.tsx. "Attended" isn't a stored status: it's a
   *  REGISTERED attendance whose event has already ended, computed here so
   *  nothing has to flip a flag after the fact. */
  async findMine(userId: string) {
    const attendance = await this.prisma.eventAttendance.findMany({
      where: { userId },
      include: { event: true },
      orderBy: { event: { startsAt: 'asc' } },
    });

    const now = new Date();
    const upcoming = attendance.filter(
      (a) => a.status === ATTENDANCE_STATUS.REGISTERED && a.event.startsAt >= now,
    );
    const attended = attendance.filter(
      (a) => a.status === ATTENDANCE_STATUS.REGISTERED && a.event.startsAt < now,
    );
    const saved = attendance.filter((a) => a.status === ATTENDANCE_STATUS.SAVED);

    return { upcoming, attended, saved };
  }

  async rsvp(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const existing = await this.prisma.eventAttendance.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });

    if (existing) {
      if (existing.status === ATTENDANCE_STATUS.REGISTERED) {
        throw new ConflictException('Already registered for this event');
      }
      // Was SAVED — upgrade to REGISTERED instead of a duplicate row
      // (unique constraint is on [userId, eventId], one row per pair).
      const attendance = await this.prisma.eventAttendance.update({
        where: { userId_eventId: { userId, eventId } },
        data: { status: ATTENDANCE_STATUS.REGISTERED },
        include: { event: true },
      });
      await this.activityService.log(userId, 'EVENT_RSVP', `Registered for ${event.title}`, { eventId });
      await this.badgesService.evaluate(userId, 'EVENTS_ATTENDED');
      return attendance;
    }

    const attendance = await this.prisma.eventAttendance.create({
      data: { userId, eventId, status: ATTENDANCE_STATUS.REGISTERED },
      include: { event: true },
    });

    await this.activityService.log(
      userId,
      'EVENT_RSVP',
      `Registered for ${event.title}`,
      { eventId },
    );
    await this.badgesService.evaluate(userId, 'EVENTS_ATTENDED');

    return attendance;
  }

  /** Bookmark an event without registering attendance. Does not downgrade
   *  an existing REGISTERED row — saving something you're already going to
   *  shouldn't un-register you. */
  async save(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const existing = await this.prisma.eventAttendance.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });
    if (existing) return existing;

    const attendance = await this.prisma.eventAttendance.create({
      data: { userId, eventId, status: ATTENDANCE_STATUS.SAVED },
      include: { event: true },
    });

    await this.notificationsService.notifyUser(userId, {
      category: NotificationCategory.EVENTS,
      title: `Saved: ${event.title}`,
      body: `Event saved to My Events.`,
      actionLabel: 'View Event',
      actionUrl: `/dashboard/events/${eventId}`,
      metadata: { eventId },
    });

    return attendance;
  }

  async unsave(userId: string, eventId: string) {
    const existing = await this.prisma.eventAttendance.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });
    if (!existing) return { removed: false };
    if (existing.status !== ATTENDANCE_STATUS.SAVED) {
      throw new ForbiddenException('Cannot unsave an event you are registered for — cancel the RSVP instead');
    }
    await this.prisma.eventAttendance.delete({ where: { userId_eventId: { userId, eventId } } });
    return { removed: true };
  }

  /** "My Events" → Attending → Cancel RSVP. Only removes a REGISTERED row —
   *  if the event is Eventbrite-linked and was registered via the webhook
   *  (viaEventbrite), this only clears GMBTE's own record; it does not
   *  cancel their actual Eventbrite ticket, which they'd need to do on
   *  Eventbrite directly. */
  async cancelRsvp(userId: string, eventId: string) {
    const existing = await this.prisma.eventAttendance.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });
    if (!existing) return { removed: false };
    if (existing.status !== ATTENDANCE_STATUS.REGISTERED) {
      throw new ForbiddenException('This event is only saved, not RSVP\'d — use unsave instead');
    }
    await this.prisma.eventAttendance.delete({ where: { userId_eventId: { userId, eventId } } });
    return { removed: true };
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  /** Admin's "who's expected" list for an event — everyone who's RSVP'd OR
   *  saved it through GMBTE, plus (if the event is linked to Eventbrite)
   *  Eventbrite's own confirmed count. Both RSVP and Saved count toward
   *  the attendee total now — a save is still someone counting themselves
   *  in, just without committing to the calendar slot yet. Same structure
   *  for admin-created and member-submitted (community) events; nothing
   *  here branches on source. */
  async findAttendees(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const attendance = await this.prisma.eventAttendance.findMany({
      where: { eventId, status: { in: [ATTENDANCE_STATUS.REGISTERED, ATTENDANCE_STATUS.SAVED] } },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, firstname: true, lastname: true, email: true } },
      },
    });

    const gmbteCount = attendance.length;
    const eventbriteCount = event.eventbriteEventId ? event.eventbriteAttendeeCount ?? 0 : null;

    return {
      eventId,
      eventTitle: event.title,
      // Kept for backwards compatibility with the existing admin UI —
      // now the combined total rather than RSVP-only.
      count: gmbteCount + (eventbriteCount ?? 0),
      gmbteCount,
      eventbriteEventId: event.eventbriteEventId,
      eventbriteCount,
      eventbriteSyncedAt: event.eventbriteSyncedAt,
      attendees: attendance.map((a) => ({
        userId: a.user.id,
        name: `${a.user.firstname} ${a.user.lastname}`,
        email: a.user.email,
        status: a.status,
        viaEventbrite: a.viaEventbrite,
        registeredAt: a.createdAt,
      })),
    };
  }

  /** Admin-triggered "Sync now" — pulls a fresh confirmed-attendee count
   *  from Eventbrite for a linked event and caches it on the row. Returns
   *  the event unchanged (with a null count) if it isn't Eventbrite-linked
   *  or if Eventbrite has no accessible data for it (see EventbriteService
   *  for why that's expected for some partner events, not a bug). */
  async syncEventbriteAttendees(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (!event.eventbriteEventId) {
      throw new ForbiddenException('This event has no linked Eventbrite event');
    }

    const count = await this.eventbriteService.getAttendeeCount(event.eventbriteEventId);
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { eventbriteAttendeeCount: count, eventbriteSyncedAt: new Date() },
    });

    this.realtime.broadcast('events:updated', { eventId });
    return updated;
  }

  /** Called from the webhook controller when Eventbrite reports a
   *  completed order on an event GMBTE has linked (see EventbriteService
   *  .resolveOrderWebhook for the payload shape). For each attendee on the
   *  order whose email matches a GMBTE account, upserts a REGISTERED
   *  EventAttendance row tagged viaEventbrite — so someone who checks out
   *  through the embedded Eventbrite widget shows up in GMBTE's own
   *  attendee list without ever clicking GMBTE's RSVP button. Attendees
   *  with no matching GMBTE account are skipped: there's nowhere to
   *  attach the row without a userId, and their ticket is still reflected
   *  in the cached eventbriteAttendeeCount from the next "Sync now". */
  async handleEventbriteWebhook(payload: { api_url?: string }) {
    const resolved = await this.eventbriteService.resolveOrderWebhook(payload);
    if (!resolved) return { processed: 0 };

    const event = await this.prisma.event.findFirst({
      where: { eventbriteEventId: resolved.eventbriteEventId },
    });
    if (!event) return { processed: 0 };

    let processed = 0;
    for (const attendee of resolved.attendees) {
      const user = await this.prisma.user.findFirst({
        where: { email: { equals: attendee.email, mode: 'insensitive' } },
      });
      if (!user) continue;

      await this.prisma.eventAttendance.upsert({
        where: { userId_eventId: { userId: user.id, eventId: event.id } },
        create: {
          userId: user.id,
          eventId: event.id,
          status: ATTENDANCE_STATUS.REGISTERED,
          viaEventbrite: true,
          eventbriteAttendeeId: attendee.attendeeId,
        },
        update: {
          status: ATTENDANCE_STATUS.REGISTERED,
          viaEventbrite: true,
          eventbriteAttendeeId: attendee.attendeeId,
        },
      });
      await this.activityService.log(user.id, 'EVENT_RSVP', `Registered for ${event.title}`, {
        eventId: event.id,
      });
      await this.badgesService.evaluate(user.id, 'EVENTS_ATTENDED');
      processed += 1;
    }

    this.realtime.broadcast('events:updated', { eventId: event.id });
    return { processed };
  }

  // ───────────────────────── Admin: event management ─────────────────────────

  async createEvent(dto: CreateEventDto, file?: Express.Multer.File) {
    let imageUrl = dto.imageUrl;
    if (file) {
      const uploaded = await this.uploadsService.uploadEventImage(file);
      imageUrl = uploaded.url;
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : undefined;

    // Linking an existing partner Eventbrite event takes priority over
    // publishToEventbrite — an admin shouldn't end up with both a pasted
    // partner link AND a brand-new GMBTE-owned Eventbrite listing.
    const linkedEventbriteId = dto.eventbriteUrl
      ? this.eventbriteService.extractEventId(dto.eventbriteUrl)
      : null;

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        imageUrl,
        mode: dto.mode,
        link: dto.link,
        tags: dto.tags ?? [],
        startsAt,
        endsAt,
        isActive: dto.isActive ?? true,
        isFeatured: dto.isFeatured ?? false,
        source: EventSource.ADMIN,
        reviewStatus: PostStatus.APPROVED,
        eventbriteEventId: linkedEventbriteId ?? undefined,
      },
    });

    if (!linkedEventbriteId && dto.publishToEventbrite) {
      const published = await this.eventbriteService.createEventOnEventbrite({
        title: dto.title,
        description: dto.description,
        startsAt,
        endsAt,
        location: dto.location,
        mode: dto.mode,
      });
      if (published) {
        return this.prisma.event.update({
          where: { id: event.id },
          data: {
            eventbriteEventId: published.id,
            link: event.link ?? published.url,
          },
        });
      }
    }

    return event;
  }

  // ───────────────────────── Member: community event submissions ─────────────────────────

  /** "Host an Event" — a member proposes their own event. Always lands
   *  PENDING; never publicly visible until an admin approves it via
   *  approveCommunityEvent(). Mirrors CommunityService's spotlight-post
   *  moderation flow, including the optional photo upload. */
  async submitCommunityEvent(userId: string, dto: CreateCommunityEventDto, file?: Express.Multer.File) {
    let imageUrl: string | undefined;
    if (file) {
      const uploaded = await this.uploadsService.uploadEventImage(file);
      imageUrl = uploaded.url;
    }

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        imageUrl,
        mode: dto.mode,
        link: dto.link,
        tags: dto.tags ?? [],
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        source: EventSource.USER,
        reviewStatus: PostStatus.PENDING,
        createdById: userId,
        eventbriteEventId: dto.eventbriteUrl
          ? this.eventbriteService.extractEventId(dto.eventbriteUrl) ?? undefined
          : undefined,
      },
    });

    await this.activityService.log(
      userId,
      'EVENT_SUBMITTED',
      `Submitted "${event.title}" for review`,
      { eventId: event.id },
    );

    return event;
  }

  /** The current user's own submissions, whatever their review state —
   *  powers a "My Submissions" view so a member can see PENDING/REJECTED
   *  events without them being publicly visible. */
  async findMySubmissions(userId: string) {
    return this.prisma.event.findMany({
      where: { source: EventSource.USER, createdById: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** "My Events" → Hosting → Edit. Ownership is checked here, not just at
   *  the controller/guard level — a valid JWT only proves who's asking,
   *  it says nothing about which event they're allowed to touch, so an
   *  event belonging to someone else must be rejected even if the caller
   *  is a perfectly legitimate, logged-in member. Editing an
   *  already-APPROVED or previously-REJECTED event resets it to PENDING
   *  and pulls it off the public listing until an admin re-approves —
   *  otherwise a member could quietly swap in different details after
   *  approval with no further review. */
  async updateMySubmission(
    eventId: string,
    userId: string,
    dto: UpdateCommunityEventDto,
    file?: Express.Multer.File,
  ) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.source !== EventSource.USER || event.createdById !== userId) {
      throw new ForbiddenException('You can only edit events you submitted yourself');
    }

    let imageUrl = event.imageUrl;
    if (file) {
      const uploaded = await this.uploadsService.uploadEventImage(file);
      imageUrl = uploaded.url;
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.mode !== undefined && { mode: dto.mode }),
        ...(dto.link !== undefined && { link: dto.link }),
        ...(dto.eventbriteUrl !== undefined && {
          eventbriteEventId: dto.eventbriteUrl
            ? this.eventbriteService.extractEventId(dto.eventbriteUrl) ?? undefined
            : null,
        }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
        ...(dto.endsAt !== undefined && { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        imageUrl,
        // Any edit sends it back under review, regardless of prior state —
        // PENDING stays PENDING, APPROVED and REJECTED both reset to PENDING.
        reviewStatus: PostStatus.PENDING,
      },
    });

    await this.activityService.log(
      userId,
      'EVENT_SUBMITTED',
      `Updated "${updated.title}" — back under review`,
      { eventId },
    );

    return updated;
  }

  /** "My Events" → Hosting → Withdraw. Hard-deletes the event, which
   *  cascades any existing EventAttendance rows (RSVPs/saves) per the
   *  schema — anyone who'd registered simply finds it gone, with no
   *  cancellation notice. Same ownership check as updateMySubmission. If
   *  the event was linked to the member's own Eventbrite listing, this
   *  never touches Eventbrite — that stays theirs to manage there. */
  async withdrawMySubmission(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.source !== EventSource.USER || event.createdById !== userId) {
      throw new ForbiddenException('You can only withdraw events you submitted yourself');
    }

    await this.prisma.event.delete({ where: { id: eventId } });
    return { removed: true };
  }

  // ───────────────────────── Admin: community event moderation ─────────────────────────

  async findPendingSubmissions() {
    return this.prisma.event.findMany({
      where: { source: EventSource.USER, reviewStatus: PostStatus.PENDING },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approveCommunityEvent(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    const updated = await this.prisma.event.update({
      where: { id },
      data: { reviewStatus: PostStatus.APPROVED },
    });

    if (updated.createdById) {
      await this.notificationsService.notifyUser(updated.createdById, {
        category: NotificationCategory.EVENTS,
        title: `Your event is live: "${updated.title}"`,
        body: 'It now shows up in Events for everyone.',
        actionLabel: 'View Event',
        actionUrl: `/dashboard/events/${updated.id}`,
        metadata: { eventId: updated.id },
      });
    }

    return updated;
  }

  async rejectCommunityEvent(id: string, reason?: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    const updated = await this.prisma.event.update({
      where: { id },
      data: { reviewStatus: PostStatus.REJECTED },
    });

    if (updated.createdById) {
      await this.notificationsService.notifyUser(updated.createdById, {
        category: NotificationCategory.EVENTS,
        title: `Your event wasn't approved: "${updated.title}"`,
        body: reason || "It didn't meet the event guidelines.",
        metadata: { eventId: updated.id },
      });
    }

    return updated;
  }

  async updateEvent(id: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    return this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.mode !== undefined && { mode: dto.mode }),
        ...(dto.link !== undefined && { link: dto.link }),
        ...(dto.eventbriteUrl !== undefined && {
          eventbriteEventId: dto.eventbriteUrl
            ? this.eventbriteService.extractEventId(dto.eventbriteUrl) ?? undefined
            : null,
        }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
        ...(dto.endsAt !== undefined && { endsAt: new Date(dto.endsAt) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.isCompleted !== undefined && { isCompleted: dto.isCompleted }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
      },
    });
  }

  async removeEvent(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    // Soft-delete: keep the row (and everyone's attendance history) intact,
    // just stop it from showing up in findUpcoming().
    return this.prisma.event.update({ where: { id }, data: { isActive: false } });
  }

  /** Powers the "N This Month" events hero card (was a fixed "8 This Month"). */
  async countThisMonth(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.prisma.eventAttendance.count({
      where: { userId, createdAt: { gte: startOfMonth } },
    });
  }

  // ───────────────────────── Admin: past-event recaps ─────────────────────────

  /** Admin fills in "what happened" after an event wraps — feeds the public
   *  "Highlights from Previous Editions" section. `keepGallery` is the
   *  subset of existing image URLs the admin left checked in the editor
   *  (removed ones just get dropped); any newly uploaded files are appended
   *  after those. Setting a recap also flips isCompleted — an admin writing
   *  up "what happened" implies the event is done, even if they hadn't
   *  toggled that separately yet. */
  async updateRecap(
    id: string,
    dto: { summary?: string; speakers?: string[]; achievements?: string[]; keepGallery?: string[] },
    files: Express.Multer.File[],
  ) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    const uploaded = await Promise.all(files.map((f) => this.uploadsService.uploadEventImage(f)));
    const gallery = [...(dto.keepGallery ?? []), ...uploaded.map((u) => u.url)];

    return this.prisma.event.update({
      where: { id },
      data: {
        isCompleted: true,
        recap: {
          summary: dto.summary ?? '',
          speakers: dto.speakers ?? [],
          achievements: dto.achievements ?? [],
          gallery,
        },
      },
    });
  }
}
