import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private activityService: ActivityService,
  ) {}

  async findUpcoming() {
    return this.prisma.event.findMany({
      where: { isActive: true, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
    });
  }

  async rsvp(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const existing = await this.prisma.eventAttendance.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });
    if (existing) throw new ConflictException('Already registered for this event');

    const attendance = await this.prisma.eventAttendance.create({
      data: { userId, eventId },
      include: { event: true },
    });

    await this.activityService.log(
      userId,
      'EVENT_RSVP',
      `Registered for ${event.title}`,
      { eventId },
    );

    return attendance;
  }

  /** Powers the "N This Month" events hero card (was a fixed "8 This Month"). */
  async countThisMonth(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.prisma.eventAttendance.count({
      where: { userId, createdAt: { gte: startOfMonth } },
    });
  }
}
