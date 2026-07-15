import { IsEmail, IsString } from 'class-validator';
export class CreateNewsletterDto {
  @IsString()
  firstName: string;

  @IsEmail()
  email: string;
}
