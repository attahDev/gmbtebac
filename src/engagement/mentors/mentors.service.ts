import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { MentorConnectionStatus } from '@prisma/client';

@Injectable()
export class MentorsService {
  constructor(
    private prisma: PrismaService,
    private activityService: ActivityService,
  ) {}

  /** Public mentor directory (used by "Find a Mentor"). */
  async findAll(skill?: string) {
    return this.prisma.mentor.findMany({
      where: {
        isActive: true,
        ...(skill ? { skills: { has: skill } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Mentors the current user is actually connected to (used by "My Mentors"). */
  async findMyMentors(userId: string) {
    const connections = await this.prisma.mentorConnection.findMany({
      where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: { mentor: true },
      orderBy: { updatedAt: 'desc' },
    });

    return connections.map((c) => ({
      connectionId: c.id,
      status: c.status,
      sessionsCompleted: c.sessionsCompleted,
      nextSessionAt: c.nextSessionAt,
      mentor: c.mentor,
    }));
  }

  async connect(userId: string, mentorId: string) {
    const mentor = await this.prisma.mentor.findUnique({ where: { id: mentorId } });
    if (!mentor) throw new NotFoundException('Mentor not found');

    const existing = await this.prisma.mentorConnection.findUnique({
      where: { userId_mentorId: { userId, mentorId } },
    });
    if (existing) throw new ConflictException('Already connected to this mentor');

    const connection = await this.prisma.mentorConnection.create({
      data: { userId, mentorId, status: MentorConnectionStatus.PENDING },
      include: { mentor: true },
    });

    await this.activityService.log(
      userId,
      'MENTOR_CONNECT_REQUESTED',
      `Requested a connection with ${mentor.name}`,
      { mentorId },
    );

    return connection;
  }

  /** Real numbers for the "My Mentors" stats row (was hardcoded 12 / 23 / +8 / 75%). */
  async stats(userId: string) {
    const connections = await this.prisma.mentorConnection.findMany({
      where: { userId },
      include: { mentor: true },
    });

    const active = connections.filter((c) => c.status === 'ACTIVE' || c.status === 'COMPLETED');
    const totalSessions = connections.reduce((sum, c) => sum + c.sessionsCompleted, 0);

    const skillsDeveloped = new Set<string>();
    active.forEach((c) => c.mentor.skills.forEach((s) => skillsDeveloped.add(s)));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const networkGrowth = connections.filter((c) => c.createdAt >= thirtyDaysAgo).length;

    const [coursesCompleted, eventsAttended] = await Promise.all([
      this.prisma.courseProgress.count({ where: { userId, isCompleted: true } }),
      this.prisma.eventAttendance.count({ where: { userId } }),
    ]);

    // Simple, transparent heuristic: readiness grows with sessions, courses and
    // events, capped at 100. Documented so product can tune the weights later
    // instead of it being a fixed "75%" nobody could explain.
    const careerReadiness = Math.min(
      100,
      totalSessions * 8 + coursesCompleted * 10 + eventsAttended * 4,
    );

    return {
      skillsDeveloped: skillsDeveloped.size,
      totalSessions,
      networkGrowth,
      careerReadinessPercent: careerReadiness,
    };
  }
}
