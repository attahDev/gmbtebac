import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

/**
 * Metric keys badges can target. Add a new one here + a resolver in
 * CURRENT_VALUE below whenever a new feature wants its own badges — this is
 * the ONE place badge logic lives, replacing the old pattern where
 * GreenImpactService computed its own badges locally and nothing else on
 * the site awarded any.
 */
export type BadgeMetric =
  | 'COURSES_COMPLETED'
  | 'MODULES_COMPLETED'
  | 'EVENTS_ATTENDED'
  | 'MENTOR_CONNECTIONS'
  | 'GREEN_ACTIONS_LOGGED'
  | 'GREEN_CO2_KG'
  | 'CERTIFICATES_EARNED';

@Injectable()
export class BadgesService {
  constructor(
    private prisma: PrismaService,
    private activityService: ActivityService,
    private realtime: RealtimeGateway,
  ) {}

  /** Resolvers for "how far along is this user on this metric right now" —
   *  same values DashboardService/GreenImpactService already compute
   *  elsewhere, just centralized so badge progress and badge awarding use
   *  the exact same numbers as the stat cards do. */
  private async currentValue(userId: string, metric: BadgeMetric): Promise<number> {
    switch (metric) {
      case 'COURSES_COMPLETED':
        return this.prisma.courseProgress.count({ where: { userId, isCompleted: true } });
      case 'MODULES_COMPLETED':
        return this.prisma.moduleProgress.count({ where: { userId, isCompleted: true } });
      case 'EVENTS_ATTENDED':
        return this.prisma.eventAttendance.count({ where: { userId, status: 'REGISTERED' } });
      case 'MENTOR_CONNECTIONS':
        return this.prisma.mentorConnection.count({ where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } } });
      case 'GREEN_ACTIONS_LOGGED':
        return this.prisma.greenAction.count({ where: { userId } });
      case 'GREEN_CO2_KG': {
        const agg = await this.prisma.greenAction.aggregate({
          where: { userId },
          _sum: { co2OffsetKg: true },
        });
        return agg._sum.co2OffsetKg ?? 0;
      }
      case 'CERTIFICATES_EARNED':
        return this.prisma.certificate.count({ where: { userId } });
    }
  }

  /**
   * Call this right after the action that could earn a badge (course
   * completed, event RSVP'd, mentor connection activated, green action
   * logged...). Cheap no-op for users nowhere near a threshold — only does
   * work for badges on the given metric.
   */
  async evaluate(userId: string, metric: BadgeMetric) {
    const candidateBadges = await this.prisma.badge.findMany({
      where: { metric, isActive: true },
    });
    if (candidateBadges.length === 0) return;

    const current = await this.currentValue(userId, metric);

    const alreadyEarned = await this.prisma.userBadge.findMany({
      where: { userId, badgeId: { in: candidateBadges.map((b) => b.id) } },
      select: { badgeId: true },
    });
    const earnedIds = new Set(alreadyEarned.map((u) => u.badgeId));

    const newlyEarned = candidateBadges.filter((b) => !earnedIds.has(b.id) && current >= b.target);
    if (newlyEarned.length === 0) return;

    await this.prisma.userBadge.createMany({
      data: newlyEarned.map((b) => ({ userId, badgeId: b.id })),
      skipDuplicates: true,
    });

    await Promise.all(
      newlyEarned.map((b) =>
        this.activityService.log(userId, 'BADGE_EARNED', `Earned the "${b.name}" badge`, { badgeId: b.id }),
      ),
    );

    // Private push to just this user — their badge grid (/badges/me) and
    // dashboard "Badges earned" stat update without a refresh, right as
    // the action that earned it (course completion, event RSVP, ...) lands.
    this.realtime.emitToUser(userId, 'badges:updated', {
      badgeIds: newlyEarned.map((b) => b.id),
    });
  }

  /** Full badge grid for the profile page — earned ones plus locked ones
   *  with live progress, same shape GreenImpactService.stats() used for its
   *  local badges, just sitewide now. */
  async listForUser(userId: string) {
    const [badges, earned] = await Promise.all([
      this.prisma.badge.findMany({ where: { isActive: true }, orderBy: { target: 'asc' } }),
      this.prisma.userBadge.findMany({ where: { userId } }),
    ]);
    const earnedMap = new Map(earned.map((e) => [e.badgeId, e.earnedAt]));

    // Compute each distinct metric's current value once, not once per badge.
    const metrics = Array.from(new Set(badges.map((b) => b.metric))) as BadgeMetric[];
    const currentByMetric = new Map<BadgeMetric, number>(
      await Promise.all(metrics.map(async (m) => [m, await this.currentValue(userId, m)] as const)),
    );

    return badges.map((b) => {
      const current = currentByMetric.get(b.metric as BadgeMetric) ?? 0;
      const earnedAt = earnedMap.get(b.id) ?? null;
      return {
        id: b.id,
        name: b.name,
        description: b.description,
        icon: b.icon,
        target: b.target,
        current: Math.round(current * 100) / 100,
        earned: earnedAt !== null,
        earnedAt,
        progress: Math.min(100, Math.round((current / b.target) * 100)),
      };
    });
  }

  async countEarned(userId: string) {
    return this.prisma.userBadge.count({ where: { userId } });
  }
}
