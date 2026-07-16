import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { MentorsService } from './mentors.service';

@Controller('mentors')
@UseGuards(JwtAuthGuard)
export class MentorsController {
  constructor(private mentorsService: MentorsService) {}

  @Get()
  findAll(@Query('skill') skill?: string) {
    return this.mentorsService.findAll(skill);
  }

  @Get('my-mentors')
  findMyMentors(@CurrentUser() user: any) {
    return this.mentorsService.findMyMentors(user.userId);
  }

  @Get('stats')
  stats(@CurrentUser() user: any) {
    return this.mentorsService.stats(user.userId);
  }

  @Post(':id/connect')
  connect(@CurrentUser() user: any, @Param('id') mentorId: string) {
    return this.mentorsService.connect(user.userId, mentorId);
  }
}
