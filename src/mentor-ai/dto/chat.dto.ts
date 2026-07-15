import {
  IsString,
  IsArray,
  IsOptional,
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
}
