/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('message')
  sendGuestMessage(@Body() body: SendChatMessageDto) {
    return this.chatbotService.sendMessage(null, body);
  }

//   @UseGuards(JwtAuthGuard)
//   @Post('message/auth')
//   sendAuthMessage(@Req() req: any, @Body() body: SendChatMessageDto) {
//     return this.chatbotService.sendMessage(req.user.userId, body);
//   }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  getHistory(@Req() req: any) {
    return this.chatbotService.getHistory(req.user.userId);
  }

  @Get('session/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return this.chatbotService.getSession(sessionId);
  }

  @Get('health')
  healthCheck() {
    return this.chatbotService.healthCheck();
  }
}