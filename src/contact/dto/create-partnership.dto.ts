import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
export class CreatePartnerRequestDto {
  @IsString()
  fullName: string;

  @IsString()
  organizationName: string;

  @IsEmail()
  email: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsBoolean()
  wantsSponsorship?: boolean;
}
