import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OpportunitiesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.opportunity.findMany({
      where: { isActive: true },
      orderBy: { postedAt: 'desc' },
    });
  }

  /** Powers the "N New Openings" hero card (was a fixed "4 New Openings"). */
  async countNew(sinceDays = 7) {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);
    return this.prisma.opportunity.count({
      where: { isActive: true, postedAt: { gte: since } },
    });
  }
}
