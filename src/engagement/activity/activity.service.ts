import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

  async findRecent(userId: string, limit = 10) {
    return this.prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
