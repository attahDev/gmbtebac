import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  otpCode: string;

  // Optional — when present, verify-email logs the user straight in
  // (returns access_token + user) instead of just marking them
  // verified. Comes from register()'s verification_token, short-lived
  // (10m) and scoped to email_verification, so it can't be reused for
  // anything else.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  verificationToken?: string;
}
