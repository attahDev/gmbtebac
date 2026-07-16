import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
export class CreateContactMessageDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  subject: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsBoolean()
  wantsPartnership?: boolean;
}
