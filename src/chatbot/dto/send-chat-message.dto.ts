import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ChatVisitorType } from '@prisma/client';

export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsEnum(ChatVisitorType)
  visitorType?: ChatVisitorType;

  @IsString()
  @MinLength(1)
  message!: string;
}