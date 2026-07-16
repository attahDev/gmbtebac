import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CommunityService {
  constructor(private prisma: PrismaService) {}

  /**
   * Admin-curated success stories. Unlike mentors/courses/events, these are
   * not meant to be per-user activity — they're editorial content — so they
   * still come from the database (not source code) but there's no per-user
   * ownership. Manage them through Prisma Studio or an admin endpoint later.
   */
  async findPublished(limit = 10) {
    return this.prisma.spotlightStory.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
