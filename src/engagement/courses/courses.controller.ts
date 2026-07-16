import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { CoursesService } from './courses.service';

@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.coursesService.findAllWithProgress(user.userId);
  }

  @Patch(':id/progress')
  updateProgress(
    @CurrentUser() user: any,
    @Param('id') courseId: string,
    @Body() body: { completedModules: number },
  ) {
    return this.coursesService.updateProgress(user.userId, courseId, body.completedModules);
  }
}
