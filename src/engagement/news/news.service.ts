import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../../uploads/uploads.service';
import { CreateNewsArticleDto } from './dto/create-news-article.dto';
import { UpdateNewsArticleDto } from './dto/update-news-article.dto';
import { containsProfanity } from './profanity-filter';

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

  // ───────────────────────── Comments ─────────────────────────
  // Same shape as CommunityService's spotlight comments, minus the
  // like/comment-count bookkeeping (NewsArticle doesn't track a running
  // comment total) and minus the author notification — the article's
  // createdBy admin isn't wired up to receive per-comment pings the way
  // a spotlight post's author is.

  /** Public — comments thread under an article. Only on active articles,
   *  same reasoning as findOne. */
  async findComments(articleId: string) {
    const article = await this.prisma.newsArticle.findUnique({ where: { id: articleId } });
    if (!article || !article.isActive) {
      throw new NotFoundException('Article not found');
    }

    return this.prisma.newsComment.findMany({
      where: { articleId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { firstname: true, lastname: true } },
      },
    });
  }

  /** Logged-in users only — enforced by JwtAuthGuard at the controller. */
  /** userId is null for guest commenters (accounts/login aren't public
   *  yet) — authorName is required in that case instead. When userId IS
   *  present, authorName is ignored in favour of the account's real name,
   *  same as every other author-attributed record in this codebase. */
  async addComment(
    userId: string | null,
    articleId: string,
    content: string,
    authorName?: string,
  ) {
    if (!content?.trim()) {
      throw new BadRequestException('Comment cannot be empty');
    }
    if (content.trim().length > 2000) {
      throw new BadRequestException('Comment is too long (max 2000 characters)');
    }
    if (!userId && !authorName?.trim()) {
      throw new BadRequestException('Name is required to comment');
    }
    if (!userId && authorName!.trim().length > 80) {
      throw new BadRequestException('Name is too long (max 80 characters)');
    }
    if (containsProfanity(content) || (!userId && containsProfanity(authorName!))) {
      throw new BadRequestException(
        "Your comment couldn't be posted — please remove any inappropriate language and try again.",
      );
    }

    const article = await this.prisma.newsArticle.findUnique({ where: { id: articleId } });
    if (!article || !article.isActive) {
      throw new NotFoundException('Article not found');
    }

    return this.prisma.newsComment.create({
      data: {
        articleId,
        userId: userId ?? undefined,
        authorName: userId ? undefined : authorName!.trim(),
        content: content.trim(),
      },
      include: {
        user: { select: { firstname: true, lastname: true } },
      },
    });
  }

  async deleteOwnComment(userId: string, commentId: string) {
    const comment = await this.prisma.newsComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException('Not your comment');

    await this.prisma.newsComment.delete({ where: { id: commentId } });
    return { removed: true };
  }

  /** Admin moderation — remove any comment regardless of author. */
  async deleteCommentAdmin(commentId: string) {
    const comment = await this.prisma.newsComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');

    await this.prisma.newsComment.delete({ where: { id: commentId } });
    return { removed: true };
  }
}
