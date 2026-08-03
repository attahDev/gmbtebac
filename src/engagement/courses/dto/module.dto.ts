import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Free-form display metadata that used to be hardcoded in
 *  sustainabilityCourses.ts — image, duration, level, etc. All optional so
 *  a course can be created with just a title and filled in later. */
export class CourseMetadataDto {
  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional() @IsString() fullDescription?: string;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsString() duration?: string;
  @IsOptional() @IsString() contactHours?: string;
  @IsOptional() @IsString() mode?: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsBoolean() certificateAvailable?: boolean;
  @IsOptional() @IsArray() learningOutcomes?: string[];
}

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** 'education' | 'climate' — used by the frontend to route content into
   * the Academy vs Green Impact sections. */
  @IsIn(['education', 'climate'])
  category: string;

  /** Academy School this course belongs to, e.g. 'microsoft' | 'aws' |
   * 'google-cloud' | 'nvidia' | 'salesforce' | 'data-science' | 'research'
   * | 'startup' | 'investor' | 'business'. Free-form on purpose — a new
   * School is just a new value here plus a frontend landing card, no
   * schema change. Only meaningful when category === 'education'. */
  @IsOptional()
  @IsString()
  school?: string;

  /** Free-form sub-tags for sorting/filtering within a category. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: CourseMetadataDto;
}

export class UpdateCourseDto {
  @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsObject() metadata?: CourseMetadataDto;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() school?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() isFeatured?: boolean;
}

export class SectionMediaDto {
  @IsIn(['image', 'video'])
  type: 'image' | 'video';

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

/** One multiple-choice question inside a 'quiz' section. correctIndex is
 *  sent to the client on the admin builder only — the student-facing
 *  module fetch strips it (see courses.service.ts findModuleBySlug),
 *  same treatment as an answer key that shouldn't ship to the browser. */
export class QuizQuestionDto {
  @IsString() @IsNotEmpty() id: string;
  @IsString() @IsNotEmpty() question: string;
  @IsArray() @IsString({ each: true }) options: string[];
  @IsInt() @Min(0) correctIndex: number;
}

export class ModuleSectionDto {
  /** Stable within the module — a student's "mark as done" checkbox is
   *  recorded against this id (see ModuleProgress), so don't reuse an id
   *  for a different section later or their completion state orphans. */
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  /** Matches the frontend's existing LessonSectionType — this DTO extends
   *  the section shape the UI already renders (LessonContent.tsx), it
   *  doesn't replace it. */
  @IsOptional()
  @IsIn(['content', 'example', 'case-study', 'activity', 'summary', 'questions', 'quiz'])
  type?: 'content' | 'example' | 'case-study' | 'activity' | 'summary' | 'questions' | 'quiz';

  /** Only present when type === 'quiz'. A pass on this section (score
   *  stored in ModuleProgress.quizScores, keyed by this section's id) is
   *  what advances CourseProgress.certificateStatus toward
   *  QUIZZES_PASSED once every quiz section in the course has one. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions?: QuizQuestionDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paragraphs?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  points?: string[];

  /** New: optional image/video embed for this section. */
  @IsOptional()
  @ValidateNested()
  @Type(() => SectionMediaDto)
  media?: SectionMediaDto;

  @IsInt()
  @Min(0)
  order: number;
}

export class ModuleContentDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learningOutcomes?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModuleSectionDto)
  sections: ModuleSectionDto[];
}

export class CreateModuleDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  /**
   * Chapter content — a description plus an ordered list of sections
   * (content/example/case-study/activity/summary/questions, same as the
   * existing lesson viewer), each optionally with an image/video embed.
   * Each section needs a stable `id`: that's what a
   * student's "mark as done" checkbox is recorded against
   * (see ModuleProgress), so don't reuse an id for a different section
   * later or their completion state will silently point at the wrong thing.
   */
  @ValidateNested()
  @Type(() => ModuleContentDto)
  content: ModuleContentDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateModuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ModuleContentDto)
  content?: ModuleContentDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
