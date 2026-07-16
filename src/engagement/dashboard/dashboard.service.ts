import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private activityService: ActivityService,
    private opportunitiesService: OpportunitiesService,
    private eventsService: EventsService,
  ) {}

  /**
   * Single call that backs the DashboardHero cards. Every field here used to
   * be a hardcoded literal in the frontend (dashboardHero.tsx) — this is the
   * real replacement. Fields are 0 / null / [] for a brand-new user instead
   * of fabricated activity that never happened.
   */
  async getSummary(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      badgesThisMonth,
      activeMentors,
      newOpportunities,
      coursesCompleted,
      eventsThisMonth,
      recentActivity,
      activeConnection,
    ] = await Promise.all([
      this.prisma.userBadge.count({ where: { userId, earnedAt: { gte: startOfMonth } } }),
      this.prisma.mentorConnection.count({ where: { userId, status: 'ACTIVE' } }),
      this.opportunitiesService.countNew(),
      this.prisma.courseProgress.count({ where: { userId, isCompleted: true } }),
      this.eventsService.countThisMonth(userId),
      this.activityService.findRecent(userId, 5),
      this.prisma.mentorConnection.findFirst({
        where: { userId, status: 'ACTIVE' },
        include: { mentor: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return {
      badgesThisMonth,
      activeMentors,
      newOpportunities,
      coursesCompleted,
      eventsThisMonth,
      recentActivity,
      mentorship: activeConnection
        ? {
            mentorName: activeConnection.mentor.name,
            mentorRole: activeConnection.mentor.role,
            mentorAvatar: activeConnection.mentor.avatarUrl,
            sessionsCompleted: activeConnection.sessionsCompleted,
            nextSessionAt: activeConnection.nextSessionAt,
          }
        : null,
    };
  }
}
