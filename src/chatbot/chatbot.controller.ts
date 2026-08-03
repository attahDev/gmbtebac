/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { UserRole } from '@prisma/client';
import { OptionalJwtAuthGuard } from 'src/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  // Optional auth: works the same for anonymous visitors and logged-in
  // users. When a valid token is present, the session gets tied to that
  // user (so it shows up in getHistory); when it isn't, it behaves exactly
  // like the old guest-only endpoint.
  @UseGuards(OptionalJwtAuthGuard)
  @Post('message')
  sendMessage(@Req() req: any, @Body() body: SendChatMessageDto) {
    return this.chatbotService.sendMessage(req.user?.userId ?? null, body);
  }

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

  // ---------------- ADMIN: knowledge articles ----------------

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/knowledge')
  listKnowledge() {
    return this.chatbotService.listKnowledge();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/knowledge')
  createKnowledge(@Body() body: { title: string; body: string; category?: string }) {
    return this.chatbotService.createKnowledge(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/knowledge/:id')
  updateKnowledge(
    @Param('id') id: string,
    @Body() body: { title?: string; body?: string; category?: string; isActive?: boolean },
  ) {
    return this.chatbotService.updateKnowledge(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/knowledge/:id')
  deleteKnowledge(@Param('id') id: string) {
    return this.chatbotService.deleteKnowledge(id);
  }
}
