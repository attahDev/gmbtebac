/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsEnum,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstname: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastname: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Google' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  organization: string;

  @ApiProperty({
    example: 'STUDENT',
    enum: ['STUDENT', 'PROFESSIONAL', 'ENGINEER', 'ADMIN', 'OTHER'],
  })
  @IsEnum(['STUDENT', 'PROFESSIONAL', 'ENGINEER', 'ADMIN', 'OTHER'], {
    message: 'Valid role required',
  })
  role: 'STUDENT' | 'PROFESSIONAL' | 'ENGINEER' | 'ADMIN' | 'OTHER';

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: true,
    description: 'User agrees to terms and conditions',
  })
  @IsBoolean()
  agreedToTerms: boolean;

  @IsOptional()
  @IsBoolean()
  subscribedToNews?: boolean;
}
