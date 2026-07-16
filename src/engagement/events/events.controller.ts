import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Get()
  findUpcoming() {
    return this.eventsService.findUpcoming();
  }

  @Post(':id/rsvp')
  rsvp(@CurrentUser() user: any, @Param('id') eventId: string) {
    return this.eventsService.rsvp(user.userId, eventId);
  }
}
