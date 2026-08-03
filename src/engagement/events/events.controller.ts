import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateCommunityEventDto } from './dto/create-community-event.dto';
import { UpdateCommunityEventDto } from './dto/update-community-event.dto';

@Controller('events')
export class EventsController {
  constructor(
    private eventsService: EventsService,
    private config: ConfigService,
  ) {}

  /** Public — the marketing site's Events page calls this unauthenticated. */
  @Get()
  findUpcoming(
    @Query('includeInactive') includeInactive?: string,
    @Query('search') search?: string,
  ) {
    return this.eventsService.findUpcoming(includeInactive === 'true', search);
  }

  /** "View All Events" — public, upcoming/non-completed archive for the
   *  public Events page's expand action. */
  @Get('all')
  findAllArchive() {
    return this.eventsService.findAll();
  }

  /** Public — "Our Past Events / Highlights from Previous Editions" on the
   *  public Events page. */
  @Get('past')
  findPastEvents() {
    return this.eventsService.findPastEvents();
  }

  /** Powers the "My Events" dashboard — Upcoming / Attended / Saved tabs and
   *  the stats row above them. Replaces the hardcoded arrays that used to
   *  live directly in EventUI.tsx / EventStats.tsx. */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: any) {
    return this.eventsService.findMine(user.userId);
  }

  /** The current user's own "Host an Event" submissions — PENDING/APPROVED/
   *  REJECTED — so a member can track status without them being publicly
   *  visible. Two path segments, so no ordering hazard with ':id' below,
   *  but kept up here with the other static GETs for readability. */
  @Get('community/mine')
  @UseGuards(JwtAuthGuard)
  findMySubmissions(@CurrentUser() user: any) {
    return this.eventsService.findMySubmissions(user.userId);
  }

  /** "My Events" → Hosting → Edit. Ownership is enforced in
   *  EventsService.updateMySubmission, not here — the guard only proves
   *  who's calling, not which event they're allowed to touch. Editing
   *  resets the event back to PENDING review; see the service method for
   *  why. Multipart, same shape as submitCommunityEvent below, so a new
   *  photo can be swapped in without a separate endpoint. */
  @Patch('community/mine/:id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 15 * 1024 * 1024 } }))
  updateMySubmission(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: Record<string, string>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const dto: UpdateCommunityEventDto = {
      title: body.title || undefined,
      description: body.description || undefined,
      location: body.location || undefined,
      mode: body.mode || undefined,
      link: body.link || undefined,
      eventbriteUrl: body.eventbriteUrl || undefined,
      startsAt: body.startsAt || undefined,
      endsAt: body.endsAt || undefined,
      tags: body.tags
        ? body.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined,
    };
    return this.eventsService.updateMySubmission(id, user.userId, dto, file);
  }

  /** "My Events" → Hosting → Withdraw. Hard-deletes — see
   *  EventsService.withdrawMySubmission for what that means for existing
   *  RSVPs. */
  @Delete('community/mine/:id')
  @UseGuards(JwtAuthGuard)
  withdrawMySubmission(@CurrentUser() user: any, @Param('id') id: string) {
    return this.eventsService.withdrawMySubmission(id, user.userId);
  }

  /** Single event, for a detail modal/page. Public — same reasoning as
   *  findUpcoming above. Registered after the static 'all'/'past'/'mine'
   *  paths above so those aren't swallowed as :id values. */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  /** Admin's "expected invitees" list — everyone who's RSVP'd through
   *  GMBTE for this event, regardless of whether it links out to
   *  Eventbrite. Static path segment, registered before the admin ':id'
   *  routes below for the same reason as findOne above. */
  @Get('admin/:id/attendees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAttendees(@Param('id') id: string) {
    return this.eventsService.findAttendees(id);
  }

  /** Admin's "Sync now" button on the attendees modal — pulls a fresh
   *  confirmed-attendee count from Eventbrite for a linked event. */
  @Post('admin/:id/eventbrite/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  syncEventbriteAttendees(@Param('id') id: string) {
    return this.eventsService.syncEventbriteAttendees(id);
  }

  /** Eventbrite's webhook callback — fires when someone completes checkout
   *  on the embedded Eventbrite widget for a linked event ("order.placed").
   *  Deliberately unauthenticated (Eventbrite can't send a JWT), so the
   *  secret path segment is what stands in for auth here — configure the
   *  same value as EVENTBRITE_WEBHOOK_SECRET both here and in Eventbrite's
   *  webhook settings for this endpoint's full URL. Always 200s (even on a
   *  wrong secret or unresolvable payload) since Eventbrite retries
   *  aggressively on non-2xx and there's nothing actionable to retry here. */
  @Post('webhooks/eventbrite/:secret')
  async eventbriteWebhook(@Param('secret') secret: string, @Body() payload: { api_url?: string }) {
    const expected = this.config.get<string>('EVENTBRITE_WEBHOOK_SECRET');
    if (!expected || secret !== expected) {
      return { ok: true };
    }
    return this.eventsService.handleEventbriteWebhook(payload);
  }

  /** "Host an Event" — any authenticated member can submit one. No
   *  RolesGuard: this is deliberately open to everyone, unlike admin
   *  createEvent() below. Multipart: same fields as CreateCommunityEventDto
   *  plus an optional `image` file — matches community.controller.ts's
   *  createPost pattern rather than binding a DTO straight off multipart
   *  body, since `tags` needs manual parsing either way. Always lands
   *  PENDING — see EventsService. */
  @Post('community')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 15 * 1024 * 1024 } }))
  submitCommunityEvent(
    @CurrentUser() user: any,
    @Body('title') title: string,
    @Body('description') description: string,
    @Body('location') location: string,
    @Body('mode') mode: string,
    @Body('link') link: string,
    @Body('eventbriteUrl') eventbriteUrl: string,
    @Body('startsAt') startsAt: string,
    @Body('endsAt') endsAt: string,
    @Body('tags') tagsText: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!title?.trim() || !startsAt) {
      throw new BadRequestException('Title and start date are required');
    }

    const dto: CreateCommunityEventDto = {
      title,
      description: description || undefined,
      location: location || undefined,
      mode: mode || undefined,
      link: link || undefined,
      eventbriteUrl: eventbriteUrl || undefined,
      startsAt,
      endsAt: endsAt || undefined,
      tags: tagsText
        ? tagsText.split(',').map((t) => t.trim()).filter(Boolean)
        : [],
    };

    return this.eventsService.submitCommunityEvent(user.userId, dto, file);
  }

  @Post(':id/rsvp')
  @UseGuards(JwtAuthGuard)
  rsvp(@CurrentUser() user: any, @Param('id') eventId: string) {
    return this.eventsService.rsvp(user.userId, eventId);
  }

  /** "My Events" → Attending → Cancel RSVP. Only clears the REGISTERED row
   *  in GMBTE's own record — see EventsService.cancelRsvp for the
   *  Eventbrite caveat. */
  @Delete(':id/rsvp')
  @UseGuards(JwtAuthGuard)
  cancelRsvp(@CurrentUser() user: any, @Param('id') eventId: string) {
    return this.eventsService.cancelRsvp(user.userId, eventId);
  }

  @Post(':id/save')
  @UseGuards(JwtAuthGuard)
  save(@CurrentUser() user: any, @Param('id') eventId: string) {
    return this.eventsService.save(user.userId, eventId);
  }

  @Delete(':id/save')
  @UseGuards(JwtAuthGuard)
  unsave(@CurrentUser() user: any, @Param('id') eventId: string) {
    return this.eventsService.unsave(user.userId, eventId);
  }

  // ───────────────────────── Admin: event management ─────────────────────────

  /** Admin: create an official event. Accepts either a plain JSON body (no
   *  image) or multipart/form-data (when an image file is attached) — the
   *  admin form switches between the two depending on whether formImage is
   *  set. Previously this only bound @Body() to CreateEventDto, which works
   *  for JSON but silently fails validation for multipart requests (no
   *  FileInterceptor meant the multipart stream was never parsed into the
   *  DTO's fields, so title/startsAt came through empty → 400). Mirrors
   *  submitCommunityEvent's manual-parsing approach below for the same
   *  reason: values arrive as strings from multipart but native types from
   *  JSON, so both need normalizing here rather than trusting class-validator
   *  alone. */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 15 * 1024 * 1024 } }))
  createEvent(@Body() body: any, @UploadedFile() file?: Express.Multer.File) {
    if (!body?.title?.toString().trim() || !body?.startsAt) {
      throw new BadRequestException('Title and start date are required');
    }

    const parseBoolean = (value: any, fallback: boolean): boolean => {
      if (value === undefined || value === null || value === '') return fallback;
      if (typeof value === 'boolean') return value;
      return value === 'true';
    };

    const parseTags = (value: any): string[] => {
      if (Array.isArray(value)) return value.map(String).map((t) => t.trim()).filter(Boolean);
      if (typeof value === 'string' && value.trim()) {
        return value.split(',').map((t) => t.trim()).filter(Boolean);
      }
      return [];
    };

    const dto: CreateEventDto = {
      title: body.title,
      description: body.description || undefined,
      location: body.location || undefined,
      imageUrl: body.imageUrl || undefined,
      mode: body.mode || undefined,
      link: body.link || undefined,
      eventbriteUrl: body.eventbriteUrl || undefined,
      publishToEventbrite: parseBoolean(body.publishToEventbrite, false),
      startsAt: body.startsAt,
      endsAt: body.endsAt || undefined,
      isActive: parseBoolean(body.isActive, true),
      isFeatured: parseBoolean(body.isFeatured, false),
      audience: body.audience || undefined,
      tags: parseTags(body.tags),
    };

    return this.eventsService.createEvent(dto, file);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateEvent(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.updateEvent(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeEvent(@Param('id') id: string) {
    return this.eventsService.removeEvent(id);
  }

  // ───────────────────────── Admin: community event moderation ─────────────────────────

  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findPendingSubmissions() {
    return this.eventsService.findPendingSubmissions();
  }

  @Patch('admin/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  approveCommunityEvent(@Param('id') id: string) {
    return this.eventsService.approveCommunityEvent(id);
  }

  @Patch('admin/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  rejectCommunityEvent(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.eventsService.rejectCommunityEvent(id, reason);
  }

  /** Admin writes up "what happened" after an event — powers the public
   *  Highlights section. Multipart: summary/speakers/achievements as text
   *  fields (speakers/achievements comma-separated, same convention as
   *  tags), keepGallery as a JSON-stringified array of URLs the admin left
   *  in place, plus any number of new `gallery` image files. */
  @Patch('admin/:id/recap')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FilesInterceptor('gallery', 10, { limits: { fileSize: 15 * 1024 * 1024 } }))
  updateRecap(
    @Param('id') id: string,
    @Body('summary') summary: string,
    @Body('speakers') speakersText: string,
    @Body('achievements') achievementsText: string,
    @Body('keepGallery') keepGalleryJson: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    let keepGallery: string[] = [];
    try {
      keepGallery = keepGalleryJson ? JSON.parse(keepGalleryJson) : [];
    } catch {
      keepGallery = [];
    }

    return this.eventsService.updateRecap(
      id,
      {
        summary: summary || undefined,
        speakers: speakersText ? speakersText.split(',').map((s) => s.trim()).filter(Boolean) : [],
        achievements: achievementsText
          ? achievementsText.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        keepGallery,
      },
      files ?? [],
    );
  }
}
