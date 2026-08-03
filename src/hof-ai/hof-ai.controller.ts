import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from 'src/guards/optional-jwt-auth.guard';
import { HofAiService } from './hof-ai.service';
import { HofChatDto } from './dto/chat.dto';

@Controller('hof-ai')
export class HofAiController {
  constructor(private readonly hofAiService: HofAiService) {}

  // Optional auth: the public Hall of Fame site has no login of its own —
  // most visitors hit this with no token at all. When one is present
  // (embedded via gmbtefro with a gmbte_token), the chat gets logged to
  // that user's activity; otherwise it just answers anonymously.
  @UseGuards(OptionalJwtAuthGuard)
  @Post('chat')
  chat(@Body() dto: HofChatDto, @Req() req: any) {
    const userId = req.user?.id ?? req.user?.sub ?? req.user?.userId;
    return this.hofAiService.chat(dto.message, userId);
  }
}
