import { IsArray, IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateNewsArticleDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  // In-platform article body. Validated against externalLink in
  // NewsService.createArticle — at least one of the two is required, but
  // that's a cross-field check class-validator can't express cleanly here.
  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  externalLink?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
