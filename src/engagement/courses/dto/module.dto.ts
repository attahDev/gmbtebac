import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';

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

  @IsOptional()
  @IsObject()
  metadata?: CourseMetadataDto;
}

export class UpdateCourseDto {
  @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsObject() metadata?: CourseMetadataDto;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateModuleDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  /**
   * Structured content for the lesson — description/duration/learningOutcomes/
   * sections, matching the shape the frontend used to get from
   * sustainabilityCourses.ts. Kept as JSON so we don't force a rigid schema
   * on lesson authors.
   */
  @IsObject()
  content: Record<string, any>;

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
  @IsObject()
  content?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
