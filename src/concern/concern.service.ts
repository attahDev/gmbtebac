import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateConcernDto } from './dto/create-concern.dto';
import { ConcernStatus } from '@prisma/client';

@Injectable()
export class ConcernService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string | null, dto: CreateConcernDto) {
    return this.prisma.concern.create({
      data: {
        userId: userId || undefined,
        concernType: dto.concernType,
        description: dto.description,
        contactEmail: dto.contactEmail,
      },
    });
  }

  // ───────────────────────── Admin: read-only listings ─────────────────────────
  // Powers the Digital Trust team's review queue.

  async findAll(limit = 50, status?: ConcernStatus) {
    return this.prisma.concern.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, email: true, firstname: true, lastname: true } } },
    });
  }

  async updateStatus(id: string, status: ConcernStatus) {
    return this.prisma.concern.update({ where: { id }, data: { status } });
  }
}
