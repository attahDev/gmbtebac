import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { CommunityService } from './community.service';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(private communityService: CommunityService) {}

  @Get('spotlight')
  findFeed(@CurrentUser() user: any) {
    return this.communityService.findFeed(user?.userId);
  }

  @Get('mine')
  findMine(@CurrentUser() user: any) {
    return this.communityService.findMine(user.userId);
  }

  @Post('spotlight/:id/like')
  like(@CurrentUser() user: any, @Param('id') id: string) {
    return this.communityService.like(user.userId, id);
  }

  @Delete('spotlight/:id/like')
  unlike(@CurrentUser() user: any, @Param('id') id: string) {
    return this.communityService.unlike(user.userId, id);
  }

  /** Multipart: title, description, optional `image` file field. Publishes
   *  immediately; the moderation bot flags it after the fact if needed. */
  @Post('posts')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 15 * 1024 * 1024 } }))
  createPost(
    @CurrentUser() user: any,
    @Body('title') title: string,
    @Body('description') description: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!title || !description) throw new BadRequestException('Title and description are required');
    return this.communityService.createPost(user.userId, { title, description }, file);
  }

  @Get('spotlight/:id/comments')
  findComments(@Param('id') id: string) {
    return this.communityService.findComments(id);
  }

  @Post('spotlight/:id/comments')
  addComment(@CurrentUser() user: any, @Param('id') id: string, @Body('content') content: string) {
    return this.communityService.addComment(user.userId, id, content);
  }

  @Delete('comments/:id')
  deleteComment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.communityService.deleteOwnComment(user.userId, id);
  }

  // --- Admin moderation -----------------------------------------------------

  @Get('admin/pending')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findPending() {
    return this.communityService.findFlagged();
  }

  @Patch('admin/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  approve(@Param('id') id: string) {
    return this.communityService.approve(id);
  }

  @Delete('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteFlaggedPost(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.communityService.deleteFlaggedPost(id, reason);
  }

  @Delete('admin/comments/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteCommentAdmin(@Param('id') id: string) {
    return this.communityService.deleteCommentAdmin(id);
  }

  @Get('admin/comments/flagged')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findFlaggedComments() {
    return this.communityService.findFlaggedComments();
  }

  @Patch('admin/comments/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  approveComment(@Param('id') id: string) {
    return this.communityService.approveComment(id);
  }
}
