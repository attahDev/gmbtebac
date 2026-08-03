import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateOpportunityDto {
  @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @IsOptional() @IsString() @IsNotEmpty() company?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() requiredSchool?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) applyUrl?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
}
