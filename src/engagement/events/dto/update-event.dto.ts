import { IsArray, IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { EventAudience } from '@prisma/client';

export class UpdateEventDto {
  @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() mode?: string;
  @IsOptional() @IsString() link?: string;
  @IsOptional() @IsString() eventbriteUrl?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsBoolean() isCompleted?: boolean;
  @IsOptional() @IsEnum(EventAudience) audience?: EventAudience;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
