import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ConcernType } from '@prisma/client';

export class CreateConcernDto {
  @IsEnum(ConcernType)
  concernType: ConcernType;

  @IsString()
  @MinLength(10)
  description: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
