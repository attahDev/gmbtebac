import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { CreateCourseDto, CreateModuleDto, UpdateCourseDto, UpdateModuleDto } from './dto/module.dto';
import { slugify } from './slugify';

@Injectable()
export class CoursesService {
  constructor(
    private prisma: PrismaService,
    private activityService: ActivityService,
  ) {}

  /** Course catalogue joined with the current user's own progress, if any.
   *  Optionally filtered by category ('education' | 'climate') so the
   *  Academy and Green Impact pages only ever see their own courses. */
  async findAllWithProgress(userId: string, category?: string) {
    const [courses, progress] = await Promise.all([
      this.prisma.course.findMany({
        where: { isActive: true, ...(category ? { category } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.courseProgress.findMany({ where: { userId } }),
    ]);

    const progressByCourse = new Map(progress.map((p) => [p.courseId, p]));

    return courses.map((course) => {
      const p = progressByCourse.get(course.id);
      const completedModules = p?.completedModules ?? 0;
      return {
        ...course,
        completedModules,
        isCompleted: p?.isCompleted ?? false,
        // totalModules can be 0 for a brand-new course with nothing uploaded
        // yet — guard against dividing by zero rather than showing NaN%.
        progressPercent:
          course.totalModules > 0 ? Math.round((completedModules / course.totalModules) * 100) : 0,
      };
    });
  }

  async findOne(courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async findBySlug(slug: string) {
    const course = await this.prisma.course.findUnique({ where: { slug } });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  /** Modules for a course, in display order — this is what the frontend
   *  fetches instead of importing sustainabilityCourses.ts / the Academy
   *  equivalent. Empty array (not an error) when nothing's been uploaded. */
  async findModules(courseId: string) {
    await this.findOne(courseId); // 404 if course doesn't exist
    return this.prisma.module.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
    });
  }

  async findModulesBySlug(courseSlug: string) {
    const course = await this.findBySlug(courseSlug);
    const modules = await this.prisma.module.findMany({
      where: { courseId: course.id },
      orderBy: { order: 'asc' },
    });
    return { course, modules };
  }

  async findModuleBySlug(courseSlug: string, lessonSlug: string) {
    const course = await this.findBySlug(courseSlug);
    const module = await this.prisma.module.findUnique({
      where: { courseId_slug: { courseId: course.id, slug: lessonSlug } },
    });
    if (!module) throw new NotFoundException('Module not found');
    return { course, module };
  }

  async updateProgress(userId: string, courseId: string, completedModules: number) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const clamped = Math.max(0, Math.min(completedModules, course.totalModules));
    const isCompleted = course.totalModules > 0 && clamped >= course.totalModules;

    const progress = await this.prisma.courseProgress.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: { completedModules: clamped, isCompleted },
      create: { userId, courseId, completedModules: clamped, isCompleted },
    });

    if (isCompleted) {
      await this.activityService.log(
        userId,
        'COURSE_COMPLETED',
        `Completed ${course.title}`,
        { courseId },
      );
    }

    return progress;
  }

  async countCompleted(userId: string) {
    return this.prisma.courseProgress.count({ where: { userId, isCompleted: true } });
  }

  // ───────────────────────── Admin: upload-driven content ─────────────────────────

  /** Create a course "shell" (title/description/category/metadata) with 0
   *  modules — totalModules rises automatically as modules get uploaded. */
  async createCourse(dto: CreateCourseDto) {
    const slug = await this.uniqueCourseSlug(dto.title);
    return this.prisma.course.create({
      data: {
        slug,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        metadata: dto.metadata ?? undefined,
        totalModules: 0,
      },
    });
  }

  async updateCourse(courseId: string, dto: UpdateCourseDto) {
    await this.findOne(courseId);
    return this.prisma.course.update({
      where: { id: courseId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.metadata !== undefined ? { metadata: dto.metadata } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /** Upload a module into a course. This is the "upload in the backend"
   *  endpoint — no default/placeholder content is ever created; a module
   *  only exists once an admin posts one, and totalModules increments to
   *  match immediately after. */
  async addModule(courseId: string, dto: CreateModuleDto) {
    await this.findOne(courseId);
    const slug = await this.uniqueModuleSlug(courseId, dto.title);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.module.create({
        data: {
          courseId,
          slug,
          title: dto.title,
          content: dto.content,
          order: dto.order ?? (await tx.module.count({ where: { courseId } })),
        },
      });
      await tx.course.update({
        where: { id: courseId },
        data: { totalModules: await tx.module.count({ where: { courseId } }) },
      });
      return created;
    });
  }

  async updateModule(courseId: string, moduleId: string, dto: UpdateModuleDto) {
    const existing = await this.prisma.module.findFirst({ where: { id: moduleId, courseId } });
    if (!existing) throw new NotFoundException('Module not found');

    const data: Record<string, any> = {};
    if (dto.title !== undefined) {
      data.title = dto.title;
      data.slug = await this.uniqueModuleSlug(courseId, dto.title, moduleId);
    }
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.order !== undefined) data.order = dto.order;

    return this.prisma.module.update({ where: { id: moduleId }, data });
  }

  async removeModule(courseId: string, moduleId: string) {
    const existing = await this.prisma.module.findFirst({ where: { id: moduleId, courseId } });
    if (!existing) throw new NotFoundException('Module not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.module.delete({ where: { id: moduleId } });
      await tx.course.update({
        where: { id: courseId },
        data: { totalModules: await tx.module.count({ where: { courseId } }) },
      });
    });

    return { deleted: true };
  }

  private async uniqueCourseSlug(title: string): Promise<string> {
    const base = slugify(title) || 'course';
    let candidate = base;
    let i = 1;
    // Small catalogues (dozens of courses) — a loop is simpler and fine here.
    while (await this.prisma.course.findUnique({ where: { slug: candidate } })) {
      i += 1;
      candidate = `${base}-${i}`;
    }
    return candidate;
  }

  private async uniqueModuleSlug(courseId: string, title: string, excludeModuleId?: string): Promise<string> {
    const base = slugify(title) || 'module';
    let candidate = base;
    let i = 1;
    for (;;) {
      const existing = await this.prisma.module.findUnique({
        where: { courseId_slug: { courseId, slug: candidate } },
      });
      if (!existing || existing.id === excludeModuleId) break;
      i += 1;
      candidate = `${base}-${i}`;
    }
    return candidate;
  }
}
