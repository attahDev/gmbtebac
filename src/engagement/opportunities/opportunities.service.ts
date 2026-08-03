import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

type FindAllOptions = {
  search?: string;
  category?: string;
  includeInactive?: boolean;
  school?: string;
  /** When true, drop rows whose requiredSchool the caller hasn't been
   *  certified in. Requires userId. Rows with no requiredSchool always pass. */
  eligibleOnly?: boolean;
  userId?: string;
};

@Injectable()
export class OpportunitiesService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  async findAll({ search, category, includeInactive, school, eligibleOnly, userId }: FindAllOptions = {}) {
    const where: Prisma.OpportunityWhereInput = includeInactive ? {} : { isActive: true };

    if (category) {
      where.category = category;
    }

    if (school) {
      where.requiredSchool = school;
    }

    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { company: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    // Featured first (manual or API-sourced), then most recently posted —
    // mirrors Event.isFeatured / Course.isFeatured sort order.
    const opportunities = await this.prisma.opportunity.findMany({
      where,
      orderBy: [{ isFeatured: 'desc' }, { postedAt: 'desc' }],
    });

    if (!eligibleOnly || !userId) return opportunities;

    // "By Certification" filter: only keep rows with no requiredSchool, or
    // whose requiredSchool the caller has an earned Certificate for.
    const earned = await this.prisma.certificate.findMany({
      where: { userId },
      select: { course: { select: { school: true } } },
    });
    const earnedSchools = new Set(earned.map((c) => c.course.school).filter(Boolean));
    return opportunities.filter((o) => !o.requiredSchool || earnedSchools.has(o.requiredSchool));
  }

  async findSchools() {
    const rows = await this.prisma.opportunity.findMany({
      where: { isActive: true, requiredSchool: { not: null } },
      select: { requiredSchool: true },
      distinct: ['requiredSchool'],
    });
    return rows.map((r) => r.requiredSchool).filter(Boolean).sort();
  }

  async findCategories() {
    const rows = await this.prisma.opportunity.findMany({
      where: { isActive: true, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    return rows.map((r) => r.category).filter(Boolean).sort();
  }

  async findOne(id: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    return opportunity;
  }

  /** Powers the "N New Openings" hero card (was a fixed "4 New Openings"). */
  async countNew(sinceDays = 7) {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);
    return this.prisma.opportunity.count({
      where: { isActive: true, postedAt: { gte: since } },
    });
  }

  async create(dto: CreateOpportunityDto) {
    const opportunity = await this.prisma.opportunity.create({
      data: {
        ...dto,
        source: 'MANUAL',
      },
    });
    this.realtime.broadcast('opportunities:updated');
    return opportunity;
  }

  async update(id: string, dto: UpdateOpportunityDto) {
    await this.findOne(id);
    const opportunity = await this.prisma.opportunity.update({ where: { id }, data: dto });
    this.realtime.broadcast('opportunities:updated');
    return opportunity;
  }

  async remove(id: string) {
    await this.findOne(id);
    // Soft-delete, same as Course/Event — keeps history/analytics intact
    // and lets an admin restore instead of losing the row outright.
    const opportunity = await this.prisma.opportunity.update({ where: { id }, data: { isActive: false } });
    this.realtime.broadcast('opportunities:updated');
    return opportunity;
  }
}
