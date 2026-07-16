import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class CoursesService {
  constructor(
    private prisma: PrismaService,
    private activityService: ActivityService,
  ) {}

  /** Course catalogue joined with the current user's own progress, if any. */
  async findAllWithProgress(userId: string) {
    const [courses, progress] = await Promise.all([
      this.prisma.course.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' } }),
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
        progressPercent: Math.round((completedModules / course.totalModules) * 100),
      };
    });
  }

  async updateProgress(userId: string, courseId: string, completedModules: number) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const clamped = Math.max(0, Math.min(completedModules, course.totalModules));
    const isCompleted = clamped >= course.totalModules;

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
}
