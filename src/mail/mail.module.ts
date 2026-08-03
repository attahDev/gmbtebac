import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// Render's free tier blocks all outbound SMTP ports (25, 465, 587) as
// of Sept 2025 — see https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports.
// That made nodemailer/@nestjs-modules/mailer's SMTP transport
// unusable here (ETIMEDOUT on every send, regardless of how correct
// the SMTP credentials were). Sending mail via Brevo's HTTPS API
// instead (see mail.service.ts) isn't affected by that block — port
// 443 outbound isn't restricted.
@Module({
  imports: [ConfigModule, HttpModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
