import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateMentorDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() @IsNotEmpty() role?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) skills?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @IsNotEmpty() category?: string;
  // Schools this mentor may review certification projects for. Omit/empty = unrestricted.
  @IsOptional() @IsArray() @IsString({ each: true }) schools?: string[];
}
