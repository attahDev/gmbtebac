import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../../uploads/uploads.service';
import { CreateNewsArticleDto } from './dto/create-news-article.dto';
import { UpdateNewsArticleDto } from './dto/update-news-article.dto';

@Injectable()
export class NewsService {
  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
  ) {}

  /** Landing page teaser — active articles only, featured pinned first,
   *  newest next. `limit` caps how many come back so the landing section
   *  doesn't have to slice a full archive client-side. */
  async findLatest(limit = 3) {
    return this.prisma.newsArticle.findMany({
      where: { isActive: true },
      orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
    });
  }

  /** Public /news archive — same ordering as the teaser, no cap. */
  async findAll(search?: string) {
    return this.prisma.newsArticle.findMany({
      where: {
        isActive: true,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { excerpt: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
    });
  }

  /** Single article detail page. Only serves active articles publicly —
   *  same reasoning as EventsService.findOne not leaking soft-deleted
   *  rows via a guessable id. */
  async findOne(id: string) {
    const article = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!article || !article.isActive) {
      throw new NotFoundException('Article not found');
    }
    return article;
  }

  // ───────────────────────── Admin ─────────────────────────

  /** Full list including inactive, for the admin panel table. */
  async findAllAdmin() {
    return this.prisma.newsArticle.findMany({
      orderBy: [{ publishedAt: 'desc' }],
    });
  }

  async createArticle(userId: string, dto: CreateNewsArticleDto, file?: Express.Multer.File) {
    if (!dto.body?.trim() && !dto.externalLink?.trim()) {
      throw new BadRequestException('Provide either an article body or an external link');
    }

    let coverImageUrl = dto.coverImageUrl;
    if (file) {
      const uploaded = await this.uploadsService.uploadNewsImage(file);
      coverImageUrl = uploaded.url;
    }

    return this.prisma.newsArticle.create({
      data: {
        title: dto.title,
        excerpt: dto.excerpt,
        coverImageUrl,
        body: dto.body,
        externalLink: dto.externalLink,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
        isActive: dto.isActive ?? true,
        isFeatured: dto.isFeatured ?? false,
        tags: dto.tags ?? [],
        createdById: userId,
      },
    });
  }

  async updateArticle(id: string, dto: UpdateNewsArticleDto, file?: Express.Multer.File) {
    const existing = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');

    let coverImageUrl = dto.coverImageUrl;
    if (file) {
      const uploaded = await this.uploadsService.uploadNewsImage(file);
      coverImageUrl = uploaded.url;
    }

    // Guard against ending up with neither body nor externalLink after the
    // update lands — mirrors the same check in createArticle.
    const nextBody = dto.body !== undefined ? dto.body : existing.body;
    const nextLink = dto.externalLink !== undefined ? dto.externalLink : existing.externalLink;
    if (!nextBody?.trim() && !nextLink?.trim()) {
      throw new BadRequestException('Provide either an article body or an external link');
    }

    return this.prisma.newsArticle.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
        ...(coverImageUrl !== undefined && { coverImageUrl }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.externalLink !== undefined && { externalLink: dto.externalLink }),
        ...(dto.publishedAt !== undefined && { publishedAt: new Date(dto.publishedAt) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
      },
    });
  }

  /** Soft-delete: keep the row intact, just stop it from showing up in
   *  findLatest/findAll — same convention as EventsService.removeEvent.
   *  Undone by PATCHing isActive back to true. */
  async removeArticle(id: string) {
    const existing = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');

    return this.prisma.newsArticle.update({ where: { id }, data: { isActive: false } });
  }
}
