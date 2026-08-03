import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { BadgesService } from '../badges/badges.service';
import { CreateCourseDto, CreateModuleDto, UpdateCourseDto, UpdateModuleDto } from './dto/module.dto';
import { slugify } from './slugify';

@Injectable()
export class CoursesService {
  constructor(
    private prisma: PrismaService,
    private activityService: ActivityService,
    private badgesService: BadgesService,
  ) {}

  /** Course catalogue joined with the current user's own progress, if any.
   *  Optionally filtered by category ('education' | 'climate') so the
   *  Academy and Green Impact pages only ever see their own courses.
   *  includeInactive lets the admin course table show removed (isActive:
   *  false) courses too, so "remove" is reversible instead of a black hole. */
  async findAllWithProgress(
    userId: string,
    category?: string,
    includeInactive = false,
    school?: string,
  ) {
    const [courses, progress] = await Promise.all([
      this.prisma.course.findMany({
        where: {
          ...(includeInactive ? {} : { isActive: true }),
          ...(category ? { category } : {}),
          ...(school ? { school } : {}),
        },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
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

  /** Batched version of findModules for dashboard loads that need modules
   *  for several courses at once (e.g. the course list page) — one round
   *  trip instead of one request per course. Silently skips ids that don't
   *  exist rather than 404ing the whole batch over one bad id. */
  async findModulesForCourses(courseIds: string[]) {
    const modules = await this.prisma.module.findMany({
      where: { courseId: { in: courseIds } },
      orderBy: { order: 'asc' },
    });

    const byCourse = new Map<string, typeof modules>();
    for (const id of courseIds) byCourse.set(id, []);
    for (const m of modules) byCourse.get(m.courseId)?.push(m);

    return Object.fromEntries(byCourse);
  }

  async findModulesBySlug(courseSlug: string) {
    const course = await this.findBySlug(courseSlug);
    const modules = await this.prisma.module.findMany({
      where: { courseId: course.id },
      orderBy: { order: 'asc' },
    });
    return { course, modules };
  }

  async findModuleBySlug(courseSlug: string, lessonSlug: string, userId?: string) {
    const course = await this.findBySlug(courseSlug);
    const module = await this.prisma.module.findUnique({
      where: { courseId_slug: { courseId: course.id, slug: lessonSlug } },
    });
    if (!module) throw new NotFoundException('Module not found');

    const progress = userId
      ? await this.prisma.moduleProgress.findUnique({
          where: { userId_moduleId: { userId, moduleId: module.id } },
        })
      : null;

    return {
      course,
      module: {
        ...module,
        content: this.stripQuizAnswerKeys(module.content),
        completedSectionIds: progress?.completedSectionIds ?? [],
        isCompleted: progress?.isCompleted ?? false,
        quizScores: progress?.quizScores ?? {},
      },
    };
  }

  /** Never ship correctIndex to the browser for a 'quiz' section — same
   *  reasoning as not trusting a client-sent progress number: the answer
   *  key must only ever be checked server-side, in gradeQuiz below. */
  private stripQuizAnswerKeys(content: unknown) {
    const c = content as { sections?: Array<Record<string, any>> } | null;
    if (!c?.sections) return content;
    return {
      ...c,
      sections: c.sections.map((s) =>
        s.type === 'quiz' && Array.isArray(s.questions)
          ? { ...s, questions: s.questions.map(({ correctIndex, ...q }: any) => q) }
          : s,
      ),
    };
  }

  /** The real progress mechanic — a student checks a section as done, this
   *  toggles it, recomputes whether the whole module is done (every
   *  section id present), and recomputes CourseProgress from a fresh count
   *  rather than incrementing/decrementing a counter (which drifts if a
   *  section gets unchecked, a module gets deleted, etc — a recount can't
   *  drift). Replaces the old PATCH /courses/:id/progress, which just
   *  trusted whatever completedModules number the client sent — turns out
   *  nothing in the frontend was even calling it. */
  async toggleSection(userId: string, courseSlug: string, lessonSlug: string, sectionId: string) {
    const course = await this.findBySlug(courseSlug);
    const module = await this.prisma.module.findUnique({
      where: { courseId_slug: { courseId: course.id, slug: lessonSlug } },
    });
    if (!module) throw new NotFoundException('Module not found');

    const sections = ((module.content as any)?.sections ?? []) as Array<{ id: string }>;
    const sectionIds = sections.map((s) => s.id);
    if (!sectionIds.includes(sectionId)) {
      throw new NotFoundException('Section not found in this module');
    }

    const existing = await this.prisma.moduleProgress.findUnique({
      where: { userId_moduleId: { userId, moduleId: module.id } },
    });

    const current = new Set(existing?.completedSectionIds ?? []);
    if (current.has(sectionId)) {
      current.delete(sectionId);
    } else {
      current.add(sectionId);
    }

    const completedSectionIds = Array.from(current);
    const isCompleted = sectionIds.length > 0 && sectionIds.every((id) => current.has(id));

    // Was this the user's first touch on this course at all? Checked before
    // the upsert below creates the CourseProgress row, since after that it's
    // too late to tell "just started" apart from "already in progress".
    const hadCourseProgress = await this.prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
    });

    const moduleProgress = await this.prisma.moduleProgress.upsert({
      where: { userId_moduleId: { userId, moduleId: module.id } },
      update: {
        completedSectionIds,
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
      create: {
        userId,
        moduleId: module.id,
        completedSectionIds,
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    if (!hadCourseProgress) {
      await this.activityService.log(userId, 'COURSE_STARTED', `Started ${course.title}`, {
        courseId: course.id,
      });
    }

    await this.recomputeCourseProgress(userId, course.id);

    if (isCompleted && !existing?.isCompleted) {
      await this.activityService.log(
        userId,
        'MODULE_COMPLETED',
        `Completed "${module.title}" in ${course.title}`,
        { courseId: course.id, moduleId: module.id },
      );
      await this.badgesService.evaluate(userId, 'MODULES_COMPLETED');
    }

    return moduleProgress;
  }

  /** Grades a quiz section server-side against the stored correctIndex
   *  (never trusting a client-sent score), records it on ModuleProgress,
   *  and — once every quiz section across the whole course has a passing
   *  score — advances CourseProgress.certificateStatus to QUIZZES_PASSED
   *  so the student can move on to the practical-project step. */
  async submitQuiz(
    userId: string,
    courseSlug: string,
    lessonSlug: string,
    sectionId: string,
    answers: Record<string, number>,
  ) {
    const course = await this.findBySlug(courseSlug);
    const module = await this.prisma.module.findUnique({
      where: { courseId_slug: { courseId: course.id, slug: lessonSlug } },
    });
    if (!module) throw new NotFoundException('Module not found');

    const sections = ((module.content as any)?.sections ?? []) as Array<Record<string, any>>;
    const section = sections.find((s) => s.id === sectionId && s.type === 'quiz');
    if (!section) throw new NotFoundException('Quiz section not found in this module');

    const questions = (section.questions ?? []) as Array<{ id: string; correctIndex: number }>;
    const total = questions.length;
    const correct = questions.filter((q) => answers[q.id] === q.correctIndex).length;
    // 70% pass mark — matches nothing specific in the doc, easy to move to
    // course.metadata later if a School wants a different bar.
    const passed = total > 0 && correct / total >= 0.7;

    const existing = await this.prisma.moduleProgress.findUnique({
      where: { userId_moduleId: { userId, moduleId: module.id } },
    });
    const quizScores = { ...((existing?.quizScores as any) ?? {}) };
    quizScores[sectionId] = { score: correct, total, passed, attemptedAt: new Date().toISOString() };

    await this.prisma.moduleProgress.upsert({
      where: { userId_moduleId: { userId, moduleId: module.id } },
      update: { quizScores },
      create: { userId, moduleId: module.id, quizScores },
    });

    if (passed) {
      await this.maybeAdvanceToQuizzesPassed(userId, course.id);
    }

    return { score: correct, total, passed };
  }

  /** Every quiz section, across every module in the course, needs a passing
   *  score before certificateStatus can move past IN_PROGRESS. Recomputed
   *  from scratch each time (same reasoning as recomputeCourseProgress). */
  private async maybeAdvanceToQuizzesPassed(userId: string, courseId: string) {
    const modules = await this.prisma.module.findMany({ where: { courseId } });
    const quizSectionIds = modules.flatMap((m) =>
      (((m.content as any)?.sections ?? []) as Array<Record<string, any>>)
        .filter((s) => s.type === 'quiz')
        .map((s) => s.id),
    );
    if (quizSectionIds.length === 0) return; // no quizzes on this course — nothing to gate on

    const moduleProgress = await this.prisma.moduleProgress.findMany({
      where: { userId, module: { courseId } },
    });
    const allPassed = quizSectionIds.every((sectionId) =>
      moduleProgress.some((mp) => (mp.quizScores as any)?.[sectionId]?.passed),
    );
    if (!allPassed) return;

    await this.prisma.courseProgress.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: { certificateStatus: 'QUIZZES_PASSED' as any },
      create: { userId, courseId, certificateStatus: 'QUIZZES_PASSED' as any },
    });
  }

  /** The "Practical Project" step — a student submits a link once their
   *  modules and quizzes are done. Doesn't require QUIZZES_PASSED if the
   *  course has no quiz sections at all (maybeAdvanceToQuizzesPassed never
   *  ran), only that the course's modules are complete. */
  async submitProject(userId: string, courseSlug: string, submissionUrl: string) {
    const course = await this.findBySlug(courseSlug);
    const cp = await this.prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
    });
    if (!cp?.isCompleted) {
      throw new NotFoundException('Complete all modules before submitting your project');
    }

    return this.prisma.courseProgress.update({
      where: { userId_courseId: { userId, courseId: course.id } },
      data: {
        projectSubmissionUrl: submissionUrl,
        projectSubmittedAt: new Date(),
        certificateStatus: 'PROJECT_SUBMITTED' as any,
      },
    });
  }

  /** Mentor review — the gate between "submitted a project" and "has a
   *  certificate". Approving issues a Certificate row (PDF generation is
   *  a separate follow-up service, not blocking here) and flips
   *  certificateStatus to CERTIFIED; rejecting sends it back with
   *  feedback so the student can resubmit via submitProject above. */
  async reviewProject(
    mentorUserId: string,
    studentUserId: string,
    courseSlug: string,
    approve: boolean,
    feedback?: string,
  ) {
    const course = await this.findBySlug(courseSlug);
    const cp = await this.prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId: studentUserId, courseId: course.id } },
    });
    if (cp?.certificateStatus !== 'PROJECT_SUBMITTED') {
      throw new NotFoundException('No project awaiting review for this course');
    }

    await this.prisma.courseProgress.update({
      where: { userId_courseId: { userId: studentUserId, courseId: course.id } },
      data: {
        reviewedByUserId: mentorUserId,
        mentorFeedback: feedback,
        certificateStatus: (approve ? 'CERTIFIED' : 'CHANGES_REQUESTED') as any,
      },
    });

    if (!approve) return { certified: false };

    const certificate = await this.prisma.certificate.create({
      data: { userId: studentUserId, courseId: course.id, issuedByUserId: mentorUserId },
    });
    await this.activityService.log(
      studentUserId,
      'CERTIFICATE_ISSUED',
      `Certified in ${course.title}`,
      { courseId: course.id, certificateId: certificate.id },
    );
    await this.badgesService.evaluate(studentUserId, 'CERTIFICATES_EARNED');
    return { certified: true, certificate };
  }

  /** Recount from ModuleProgress rather than trust an increment/decrement —
   *  see toggleSection's comment for why. */
  private async recomputeCourseProgress(userId: string, courseId: string) {
    const [course, completedModules] = await Promise.all([
      this.prisma.course.findUnique({ where: { id: courseId } }),
      this.prisma.moduleProgress.count({
        where: { userId, isCompleted: true, module: { courseId } },
      }),
    ]);
    if (!course) return;

    const isCompleted = course.totalModules > 0 && completedModules >= course.totalModules;
    const wasCompletedBefore = await this.prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    await this.prisma.courseProgress.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: { completedModules, isCompleted },
      create: { userId, courseId, completedModules, isCompleted },
    });

    if (isCompleted && !wasCompletedBefore?.isCompleted) {
      await this.activityService.log(userId, 'COURSE_COMPLETED', `Completed ${course.title}`, { courseId });
      await this.badgesService.evaluate(userId, 'COURSES_COMPLETED');
    }
  }

  async countCompleted(userId: string) {
    return this.prisma.courseProgress.count({ where: { userId, isCompleted: true } });
  }

  // ───────────────────────── Admin: upload-driven content ─────────────────────────

  /** Create a course "shell" (title/description/category/data) with 0
   *  modules — totalModules rises automatically as modules get uploaded. */
  async createCourse(dto: CreateCourseDto) {
    const slug = await this.uniqueCourseSlug(dto.title);
    return this.prisma.course.create({
      data: {
        slug,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        school: dto.school,
        tags: dto.tags ?? [],
        isFeatured: dto.isFeatured ?? false,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? undefined,
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
        ...(dto.metadata !== undefined ? { metadata: dto.metadata as Prisma.InputJsonValue } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.school !== undefined ? { school: dto.school } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
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
          content: dto.content as unknown as Prisma.InputJsonValue, // same pattern as dto.metadata cast above
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
