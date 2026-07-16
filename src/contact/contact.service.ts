/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { CreateNewsletterDto } from './dto/create-newsletter.dto';
import { CreatePartnerRequestDto } from './dto/create-partnership.dto';

@Injectable()
export class ContactService {
  constructor(private prisma: PrismaService) {}

  async suscribe(dto: CreateNewsletterDto) {
    const exists = await this.prisma.newsletterSubscription.findUnique({
      where: { email: dto.email },
    });

    if (exists) {
      throw new ConflictException(
        'Email is already subscribed to the newsletter.',
      );
    }

    return this.prisma.newsletterSubscription.create({
      data: {
        firstName: dto.firstName,
        email: dto.email,
      },
    });
  }

  //   PARTNERS
  async partnershipRequest(dto: CreatePartnerRequestDto) {
    return await this.prisma.partnerRequest.create({
      data: {
        fullName: dto.fullName,
        organizationName: dto.organizationName,
        email: dto.email,
        message: dto.message,
        wantsSponsorship: dto.wantsSponsorship,
      },
    });
  }

  async createMessage(dto: CreateContactMessageDto) {
    return await this.prisma.contactMessage.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        wantsPartnership: dto.wantsPartnership ?? false,
      },
    });
  }
}
