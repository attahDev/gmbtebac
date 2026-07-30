import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { NewsService } from './news.service';
import { CreateNewsArticleDto } from './dto/create-news-article.dto';
import { UpdateNewsArticleDto } from './dto/update-news-article.dto';

@Controller('news')
export class NewsController {
  constructor(private newsService: NewsService) {}

  /** Public — landing page teaser. ?limit= defaults to 3 cards. */
  @Get()
  findLatest(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    return this.newsService.findLatest(parsed && !Number.isNaN(parsed) ? parsed : undefined);
  }

  /** Public — the dedicated /news page's full archive. */
  @Get('all')
  findAllArchive(@Query('search') search?: string) {
    return this.newsService.findAll(search);
  }

  // ───────────────────────── Admin ─────────────────────────
  // Static path segments registered before ':id' below so they aren't
  // swallowed as an id value — same ordering reasoning as EventsController.

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllAdmin() {
    return this.newsService.findAllAdmin();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 15 * 1024 * 1024 } }))
  createArticle(
    @CurrentUser() user: any,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // Same manual-normalisation reasoning as EventsController.createEvent:
    // multipart fields all arrive as strings, so booleans/arrays need
    // parsing here rather than trusting class-validator alone.
    const parseBoolean = (value: any, fallback: boolean): boolean => {
      if (value === undefined || value === null || value === '') return fallback;
      if (typeof value === 'boolean') return value;
      return value === 'true';
    };

    const parseTags = (value: any): string[] => {
      if (Array.isArray(value)) return value.map(String).map((t) => t.trim()).filter(Boolean);
      if (typeof value === 'string' && value.trim()) {
        return value.split(',').map((t) => t.trim()).filter(Boolean);
      }
      return [];
    };

    const dto: CreateNewsArticleDto = {
      title: body.title,
      excerpt: body.excerpt || undefined,
      coverImageUrl: body.coverImageUrl || undefined,
      body: body.body || undefined,
      externalLink: body.externalLink || undefined,
      publishedAt: body.publishedAt || undefined,
      isActive: parseBoolean(body.isActive, true),
      isFeatured: parseBoolean(body.isFeatured, false),
      tags: parseTags(body.tags),
    };

    return this.newsService.createArticle(user.userId, dto, file);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 15 * 1024 * 1024 } }))
  updateArticle(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const parseBoolean = (value: any): boolean | undefined => {
      if (value === undefined || value === null || value === '') return undefined;
      if (typeof value === 'boolean') return value;
      return value === 'true';
    };

    const parseTags = (value: any): string[] | undefined => {
      if (value === undefined) return undefined;
      if (Array.isArray(value)) return value.map(String).map((t) => t.trim()).filter(Boolean);
      if (typeof value === 'string') {
        return value.split(',').map((t) => t.trim()).filter(Boolean);
      }
      return undefined;
    };

    const dto: UpdateNewsArticleDto = {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.excerpt !== undefined && { excerpt: body.excerpt }),
      ...(body.coverImageUrl !== undefined && { coverImageUrl: body.coverImageUrl }),
      ...(body.body !== undefined && { body: body.body }),
      ...(body.externalLink !== undefined && { externalLink: body.externalLink }),
      ...(body.publishedAt !== undefined && { publishedAt: body.publishedAt }),
      ...(parseBoolean(body.isActive) !== undefined && { isActive: parseBoolean(body.isActive) }),
      ...(parseBoolean(body.isFeatured) !== undefined && { isFeatured: parseBoolean(body.isFeatured) }),
      ...(parseTags(body.tags) !== undefined && { tags: parseTags(body.tags) }),
    };

    return this.newsService.updateArticle(id, dto, file);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeArticle(@Param('id') id: string) {
    return this.newsService.removeArticle(id);
  }

  /** Single article detail — registered after the static admin/public GET
   *  routes above so those aren't swallowed as an :id value. */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.newsService.findOne(id);
  }
}
