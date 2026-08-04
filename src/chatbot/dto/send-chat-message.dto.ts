import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ChatVisitorType, ChatPersona } from '@prisma/client';

export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsEnum(ChatVisitorType)
  visitorType?: ChatVisitorType;

  // Only read when starting a NEW session (no sessionId yet). Ignored on
  // existing sessions — the persona a session was created with is final,
  // read from the DB, so a client can't switch personas mid-conversation.
  @IsOptional()
  @IsEnum(ChatPersona)
  persona?: ChatPersona;

  @IsString()
  @MinLength(1)
  message!: string;
}