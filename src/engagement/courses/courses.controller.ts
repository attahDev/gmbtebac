import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { CoursesService } from './courses.service';
import { CreateCourseDto, CreateModuleDto, UpdateCourseDto, UpdateModuleDto } from './dto/module.dto';

@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  /** ?category=education | climate — used by Academy and Green Impact pages
   *  respectively. Omit to get everything. */
  @Get()
  findAll(@CurrentUser() user: any, @Query('category') category?: string) {
    return this.coursesService.findAllWithProgress(user.userId, category);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(id);
  }

  /** What the frontend fetches instead of sustainabilityCourses.ts / the
   *  Academy equivalent. Returns [] if nothing has been uploaded yet. */
  @Get(':id/modules')
  findModules(@Param('id') id: string) {
    return this.coursesService.findModules(id);
  }

  // ── Slug-based lookups: match the /dashboard/green-impact/:courseSlug and
  //    /dashboard/green-impact/:courseSlug/:lessonSlug frontend routes. ──
  @Get('by-slug/:courseSlug')
  findBySlug(@Param('courseSlug') courseSlug: string) {
    return this.coursesService.findBySlug(courseSlug);
  }

  @Get('by-slug/:courseSlug/modules')
  findModulesBySlug(@Param('courseSlug') courseSlug: string) {
    return this.coursesService.findModulesBySlug(courseSlug);
  }

  @Get('by-slug/:courseSlug/modules/:lessonSlug')
  findModuleBySlug(
    @Param('courseSlug') courseSlug: string,
    @Param('lessonSlug') lessonSlug: string,
  ) {
    return this.coursesService.findModuleBySlug(courseSlug, lessonSlug);
  }

  @Patch(':id/progress')
  updateProgress(
    @CurrentUser() user: any,
    @Param('id') courseId: string,
    @Body() body: { completedModules: number },
  ) {
    return this.coursesService.updateProgress(user.userId, courseId, body.completedModules);
  }

  // ───────────────────────── Admin: upload-driven content ─────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  createCourse(@Body() dto: CreateCourseDto) {
    return this.coursesService.createCourse(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.coursesService.updateCourse(id, dto);
  }

  @Post(':id/modules')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  addModule(@Param('id') courseId: string, @Body() dto: CreateModuleDto) {
    return this.coursesService.addModule(courseId, dto);
  }

  @Patch(':id/modules/:moduleId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateModule(
    @Param('id') courseId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateModuleDto,
  ) {
    return this.coursesService.updateModule(courseId, moduleId, dto);
  }

  @Delete(':id/modules/:moduleId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  removeModule(@Param('id') courseId: string, @Param('moduleId') moduleId: string) {
    return this.coursesService.removeModule(courseId, moduleId);
  }
}
