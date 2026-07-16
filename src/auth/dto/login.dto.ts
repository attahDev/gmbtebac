import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  // @ApiProperty({
  //   example: 'STUDENT',
  //   enum: ['STUDENT', 'PROFESSIONAL', 'ENGINEER', 'ADMIN', 'OTHER'],
  // })
  // @IsEnum(['STUDENT', 'PROFESSIONAL', 'ENGINEER', 'ADMIN', 'OTHER'], {
  //   message: 'Valid role required',
  // })
  // role: 'STUDENT' | 'PROFESSIONAL' | 'ENGINEER' | 'ADMIN' | 'OTHER';
}
