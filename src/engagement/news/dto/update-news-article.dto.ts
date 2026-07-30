import { IsArray, IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateNewsArticleDto {
  @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @IsOptional() @IsString() excerpt?: string;
  @IsOptional() @IsString() coverImageUrl?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() externalLink?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
