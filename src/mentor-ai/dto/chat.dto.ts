import {
  IsString,
  IsArray,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';

export class ChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000) // prevent excessively long messages
  message: string;

  @IsOptional()
  @IsString()
  chatId?: string; // omit on the first message, provide thereafter

  @IsOptional()
  @IsArray()
  history?: any[];

  // Which frontend surface is talking to this endpoint. 'sam' is the
  // standalone My Mentor page (named Sam); omitted/'business_mentor' is
  // the AI Business Studio sidebar widget, which keeps its original
  // unnamed identity. Same backend chat logic, different persona framing.
  @IsOptional()
  @IsIn(['sam', 'business_mentor'])
  persona?: 'sam' | 'business_mentor';
}
