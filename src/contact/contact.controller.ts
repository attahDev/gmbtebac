/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Body, Controller, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { CreateNewsletterDto } from './dto/create-newsletter.dto';
import { Throttle } from '@nestjs/throttler';
import { CreatePartnerRequestDto } from './dto/create-partnership.dto';

@Controller('newsletter')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post('subscribe')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async subscribe(@Body() dto: CreateNewsletterDto) {
    return await this.contactService.suscribe(dto);
  }

  @Post('partnership-request')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async partnershipRequest(@Body() dto: CreatePartnerRequestDto) {
    return await this.contactService.partnershipRequest(dto);
  }

  @Post('contact-message')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async createMessage(@Body() dto: CreateContactMessageDto) {
    return await this.contactService.createMessage(dto);
  }
}
