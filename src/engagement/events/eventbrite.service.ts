import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Wraps Eventbrite's v3 API (https://www.eventbriteapi.com/v3). Two
 * important constraints shape everything here:
 *
 * 1. Eventbrite has no "create an order/attendee" endpoint — you cannot
 *    programmatically register someone as an attendee on an existing
 *    event via a server-to-server call. Registration only happens through
 *    Eventbrite's own hosted checkout or their embeddable checkout widget.
 *    So GMBTE's "push" is: surface the real Eventbrite widget on the event
 *    page, then reconcile via webhook once someone actually completes it
 *    (see handleOrderWebhook below) — not a fake API call pretending to
 *    create a ticket.
 * 2. Reading another organizer's attendee/ticket data requires *their*
 *    private token. For partner-hosted events GMBTE doesn't own, a count
 *    sync will only work if that partner has shared an organizer token —
 *    otherwise getAttendeeCount() just returns null and the admin UI falls
 *    back to GMBTE's own RSVP/Saved count only. This is expected, not a
 *    bug — same reasoning as OpportunitiesSyncService skipping providers
 *    it has no real API key for.
 *
 * Credentials (all optional — every method degrades gracefully without
 * them, same convention as OpportunitiesSyncService/ADZUNA_*):
 *   EVENTBRITE_PRIVATE_TOKEN — GMBTE's own organizer OAuth/private token
 *   EVENTBRITE_ORG_ID        — GMBTE's own organizer ID, for creating events
 *   EVENTBRITE_WEBHOOK_SECRET — shared secret in the webhook URL path so
 *                               only Eventbrite's real callback can hit it
 */
@Injectable()
export class EventbriteService {
  private readonly logger = new Logger(EventbriteService.name);
  private readonly base = 'https://www.eventbriteapi.com/v3';

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {}

  private token(): string | undefined {
    return this.config.get<string>('EVENTBRITE_PRIVATE_TOKEN');
  }

  private authHeaders(token = this.token()) {
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }

  /** Accepts either a raw Eventbrite numeric event ID, or a full event URL
   *  like https://www.eventbrite.com/e/some-event-name-123456789012 and
   *  pulls the trailing numeric ID off it. Returns null if neither shape
   *  matches, so callers can tell the admin the paste didn't look right. */
  extractEventId(urlOrId: string): string | null {
    const trimmed = urlOrId.trim();
    if (/^\d{6,}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/-(\d{6,})(?:[/?#]|$)/);
    return match ? match[1] : null;
  }

  /** Live count of confirmed ("attending") tickets for an Eventbrite event.
   *  Returns null (never throws) when there's no token, the event isn't
   *  visible to GMBTE's token (e.g. a partner's own event), or the call
   *  fails for any other reason — callers should treat null as "no
   *  Eventbrite-side number available" and fall back to GMBTE's own count. */
  async getAttendeeCount(eventbriteEventId: string): Promise<number | null> {
    const headers = this.authHeaders();
    if (!headers) {
      this.logger.warn('EVENTBRITE_PRIVATE_TOKEN not set — skipping attendee sync');
      return null;
    }

    try {
      let count = 0;
      let url: string | null = `${this.base}/events/${eventbriteEventId}/attendees/?status=attending`;

      while (url) {
        const { data }: { data: any } = await firstValueFrom(this.http.get(url, { headers }));
        count += (data?.attendees ?? []).length;
        url = data?.pagination?.has_more_items
          ? `${this.base}/events/${eventbriteEventId}/attendees/?status=attending&continuation=${data.pagination.continuation}`
          : null;
      }

      return count;
    } catch (err: any) {
      this.logger.warn(
        `Eventbrite attendee sync failed for event ${eventbriteEventId}: ${err?.response?.status ?? err.message}`,
      );
      return null;
    }
  }

  /** Publishes a brand-new, free event under GMBTE's own Eventbrite
   *  organizer account, mirroring a just-created GMBTE event — used when
   *  an admin ticks "Also publish on Eventbrite" on the create form.
   *  Returns null (logged, non-fatal) if GMBTE has no organizer
   *  credentials configured or if any step of the create/publish fails —
   *  the local GMBTE event is never blocked on this. */
  async createEventOnEventbrite(input: {
    title: string;
    description?: string;
    startsAt: Date;
    endsAt?: Date | null;
    location?: string | null;
    mode?: string | null;
  }): Promise<{ id: string; url: string } | null> {
    const token = this.token();
    const orgId = this.config.get<string>('EVENTBRITE_ORG_ID');
    const headers = this.authHeaders(token);

    if (!headers || !orgId) {
      this.logger.warn('EVENTBRITE_PRIVATE_TOKEN / EVENTBRITE_ORG_ID not set — skipping Eventbrite publish');
      return null;
    }

    try {
      const isOnline = input.mode === 'Virtual';
      const created$ = this.http.post(
        `${this.base}/organizations/${orgId}/events/`,
        {
          event: {
            name: { html: input.title },
            description: { html: input.description ?? '' },
            start: { timezone: 'Etc/UTC', utc: input.startsAt.toISOString() },
            end: {
              timezone: 'Etc/UTC',
              utc: (input.endsAt ?? new Date(input.startsAt.getTime() + 2 * 60 * 60 * 1000)).toISOString(),
            },
            currency: 'USD',
            online_event: isOnline,
            listed: true,
          },
        },
        { headers },
      );
      const { data: event }: { data: any } = await firstValueFrom(created$);
      const eventId = event.id;

      // Free ticket class — this is the "product" attendees claim through
      // Eventbrite's own checkout widget. Required before publish() will
      // accept the event.
      await firstValueFrom(
        this.http.post(
          `${this.base}/events/${eventId}/ticket_classes/`,
          {
            ticket_class: {
              name: 'General Admission',
              free: true,
              quantity_total: 500,
            },
          },
          { headers },
        ),
      );

      await firstValueFrom(this.http.post(`${this.base}/events/${eventId}/publish/`, {}, { headers }));

      return { id: String(eventId), url: event.url };
    } catch (err: any) {
      this.logger.warn(
        `Eventbrite event creation failed for "${input.title}": ${err?.response?.status ?? err.message}`,
      );
      return null;
    }
  }

  /** Eventbrite's webhook payload is intentionally thin — just
   *  { api_url: "https://www.eventbriteapi.com/v3/orders/<id>/", config: {...} }
   *  — the actual order + attendee details have to be fetched separately
   *  using GMBTE's own token. Returns the attendee emails + Eventbrite's
   *  event ID + a stable attendee ID per person on the order, or null if
   *  the payload can't be resolved (missing token, bad api_url, etc). */
  async resolveOrderWebhook(
    payload: { api_url?: string },
  ): Promise<{ eventbriteEventId: string; attendees: { email: string; attendeeId: string }[] } | null> {
    const headers = this.authHeaders();
    if (!headers || !payload?.api_url) return null;

    try {
      const { data: order }: { data: any } = await firstValueFrom(
        this.http.get(`${payload.api_url}?expand=attendees`, { headers }),
      );

      const attendees = (order?.attendees ?? [])
        .filter((a: any) => a?.status === 'Attending' && a?.profile?.email)
        .map((a: any) => ({ email: String(a.profile.email).toLowerCase(), attendeeId: String(a.id) }));

      if (!order?.event_id || attendees.length === 0) return null;

      return { eventbriteEventId: String(order.event_id), attendees };
    } catch (err: any) {
      this.logger.warn(`Failed to resolve Eventbrite webhook payload: ${err?.response?.status ?? err.message}`);
      return null;
    }
  }
}
