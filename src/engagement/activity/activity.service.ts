import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Maps an activity `type` to the tool/service section it should be
 *  grouped under on the admin Overview page. Anything not listed here
 *  falls back to 'Other' rather than throwing, so a new log type never
 *  breaks the page — it just needs a line added here to be sectioned
 *  properly. */
const TYPE_CATEGORY: Record<string, string> = {
  COURSE_STARTED: 'Academy',
  MODULE_COMPLETED: 'Academy',
  COURSE_COMPLETED: 'Academy',
  CERTIFICATE_ISSUED: 'Academy',
  GREEN_ACTION_LOGGED: 'Green Impact',
  GREEN_AI_CHAT: 'Green Impact',
  NOMINATION_SUBMITTED: 'Hall of Fame',
  HOF_AI_CHAT: 'Hall of Fame',
  EVENT_RSVP: 'Events',
  EVENT_SUBMITTED: 'Events',
  COMMUNITY_POST_SUBMITTED: 'Community',
  MENTOR_CONNECT_REQUESTED: 'Mentors & Coaches',
  MENTOR_AI_CHAT: 'Mentor AI',
  BUSINESS_PLAN_GENERATED: 'AI Business Studio',
  MARKET_RESEARCH_GENERATED: 'AI Business Studio',
  PITCH_DECK_GENERATED: 'AI Business Studio',
  PROPOSAL_GENERATED: 'AI Business Studio',
  BADGE_EARNED: 'Achievements',
};

const categoryFor = (type: string) => TYPE_CATEGORY[type] ?? 'Other';

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  /**
   * Every other engagement service (mentors, courses, events...) calls this
   * whenever the user does something worth showing on the "Recent Activity"
   * card, instead of that card being hardcoded copy.
   */
  async log(userId: string, type: string, message: string, metadata?: Record<string, unknown>) {
    return this.prisma.activityLog.create({
      data: { userId, type, message, metadata: metadata as any },
    });
  }

  /** Same as log(), but skips creating a new row if the same user already
   *  logged this exact type within `windowMinutes`. Meant for high-frequency,
   *  stateless actions (asking an AI advisor a question, for example) where
   *  logging every single call would flood a section of the admin Overview
   *  and bury everything else — one "asked the Green Advisor a question"
   *  entry per window is more useful than twenty. */
  async logThrottled(
    userId: string,
    type: string,
    message: string,
    metadata?: Record<string, unknown>,
    windowMinutes = 60,
  ) {
    const recent = await this.prisma.activityLog.findFirst({
      where: { userId, type, createdAt: { gte: new Date(Date.now() - windowMinutes * 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) return recent;
    return this.log(userId, type, message, metadata);
  }

  async findRecent(userId: string, limit = 10) {
    return this.prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Platform-wide feed for the admin portal's Overview page — every
   *  user's activity, not just the caller's, with enough user info to
   *  display who did what. */
  async findRecentAdmin(limit = 25) {
    return this.prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, firstname: true, lastname: true, email: true } } },
    });
  }

  /** Same platform-wide feed, but bucketed by tool/service instead of one
   *  flat list, so the admin Overview can render "Academy", "Green Impact",
   *  "Mentor AI"... as separate sections. Pulls a wider pool than the flat
   *  feed does (activity is never evenly spread across categories — without
   *  a wide pool a single chatty category would push everything else out of
   *  even a 200-row window) then caps each section at `perCategory`. */
  async findRecentAdminGrouped(perCategory = 15, pool = 400) {
    const rows = await this.prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: pool,
      include: { user: { select: { id: true, firstname: true, lastname: true, email: true } } },
    });

    const buckets = new Map<string, typeof rows>();
    for (const row of rows) {
      const category = categoryFor(row.type);
      const bucket = buckets.get(category);
      if (bucket) {
        if (bucket.length < perCategory) bucket.push(row);
      } else {
        buckets.set(category, [row]);
      }
    }

    // Order sections by their most recent activity, so whichever tool was
    // just used floats to the top instead of a fixed, eventually-stale order.
    return Array.from(buckets.entries())
      .map(([category, items]) => ({ category, items }))
      .sort((a, b) => +new Date(b.items[0].createdAt) - +new Date(a.items[0].createdAt));
  }
}
