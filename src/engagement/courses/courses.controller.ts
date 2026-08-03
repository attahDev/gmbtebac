import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { CoursesService } from './courses.service';
import { PdfExtractionService } from './pdf-extraction.service';
import { CreateCourseDto, CreateModuleDto, UpdateCourseDto, UpdateModuleDto } from './dto/module.dto';

@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(
    private coursesService: CoursesService,
    private pdfExtractionService: PdfExtractionService,
  ) {}

  /** Upload a PDF, get back a draft ModuleContentDto-shaped chapter to
   *  review/edit in the admin chapter builder — nothing is saved to the
   *  course until the admin submits the (possibly edited) result via the
   *  normal POST .../modules endpoint below. */
  @Post('extract-pdf')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 40 * 1024 * 1024 } }))
  extractFromPdf(@UploadedFile() file: Express.Multer.File) {
    return this.pdfExtractionService.extractModuleContent(file);
  }

  /** ?category=education | climate — used by Academy and Green Impact pages
   *  respectively. Omit to get everything.
   *  ?includeInactive=true — used by the admin course table, so a removed
   *  course is still visible (and restorable) instead of just vanishing. */
  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('school') school?: string,
  ) {
    return this.coursesService.findAllWithProgress(
      user.userId,
      category,
      includeInactive === 'true',
      school,
    );
  }

  /** ?ids=a,b,c,d — one round trip for a course list page that used to fire
   *  one GET .../modules request per course. Returns { [courseId]: Module[] },
   *  same shape you'd build client-side by keying the per-course responses.
   *  Must be registered before the ':id' route below — Nest/Express match
   *  routes in registration order, so ':id' would otherwise swallow
   *  /courses/modules as id='modules'. */
  @Get('modules')
  findModulesBatch(@Query('ids') ids: string) {
    const courseIds = (ids ?? '').split(',').map((id) => id.trim()).filter(Boolean);
    return this.coursesService.findModulesForCourses(courseIds);
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
    @CurrentUser() user: any,
    @Param('courseSlug') courseSlug: string,
    @Param('lessonSlug') lessonSlug: string,
  ) {
    return this.coursesService.findModuleBySlug(courseSlug, lessonSlug, user.userId);
  }

  /** The "mark this chapter/section done" checkbox. Toggles completion for
   *  the section, recomputes whether the module (and course) are complete
   *  from real data — nothing here trusts a number the client sends. */
  @Patch('by-slug/:courseSlug/modules/:lessonSlug/sections/:sectionId/toggle')
  toggleSection(
    @CurrentUser() user: any,
    @Param('courseSlug') courseSlug: string,
    @Param('lessonSlug') lessonSlug: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.coursesService.toggleSection(user.userId, courseSlug, lessonSlug, sectionId);
  }

  /** Student submits answers for a 'quiz' section — graded server-side,
   *  never trusts a client-sent score. */
  @Post('by-slug/:courseSlug/modules/:lessonSlug/sections/:sectionId/submit-quiz')
  submitQuiz(
    @CurrentUser() user: any,
    @Param('courseSlug') courseSlug: string,
    @Param('lessonSlug') lessonSlug: string,
    @Param('sectionId') sectionId: string,
    @Body() body: { answers: Record<string, number> },
  ) {
    return this.coursesService.submitQuiz(
      user.userId,
      courseSlug,
      lessonSlug,
      sectionId,
      body.answers ?? {},
    );
  }

  /** Student submits their practical project (a link — GitHub repo, Drive
   *  doc, deployed URL, whatever the School asks for). Requires modules
   *  already complete; see CoursesService.submitProject. */
  @Post('by-slug/:courseSlug/submit-project')
  submitProject(
    @CurrentUser() user: any,
    @Param('courseSlug') courseSlug: string,
    @Body() body: { submissionUrl: string },
  ) {
    return this.coursesService.submitProject(user.userId, courseSlug, body.submissionUrl);
  }

  /** Mentor approves/rejects a submitted project. Restricted to MENTOR and
   *  ADMIN roles — approval is what issues the Certificate. */
  @Post('by-slug/:courseSlug/review/:studentUserId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MENTOR, UserRole.ADMIN)
  reviewProject(
    @CurrentUser() user: any,
    @Param('courseSlug') courseSlug: string,
    @Param('studentUserId') studentUserId: string,
    @Body() body: { approve: boolean; feedback?: string },
  ) {
    return this.coursesService.reviewProject(
      user.userId,
      studentUserId,
      courseSlug,
      body.approve,
      body.feedback,
    );
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
