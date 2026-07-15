/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { MentorAiService } from './mentor-ai.service';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { ChatDto } from './dto/chat.dto';
import { Req } from '@nestjs/common';

@Controller('mentor-ai')
export class MentorAiController {
  constructor(private readonly mentorAiService: MentorAiService) {}

  @UseGuards(JwtAuthGuard)
  @Post('chat')
  async chat(@Body() dto: ChatDto, @Req() req) {
    // console.log('REQ USER:', req.user);

    const userId = req.user?.id ?? req.user?.sub ?? req.user?.userId;

    if (!userId) {
      throw new BadRequestException('User ID not found from token');
    }

    const result = await this.mentorAiService.chat(
      userId,
      dto.message,
      dto.chatId,
    );

    return {
      reply: result.reply,
      chatId: result.chatId,
    };
  }
}
