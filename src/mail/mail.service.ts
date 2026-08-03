import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import { join } from 'path';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private verificationTemplate: HandlebarsTemplateDelegate;
  private passwordResetTemplate: HandlebarsTemplateDelegate;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    // Templates live next to this file post-build (see nest-cli.json's
    // "assets" config, which copies mail/templates/**/*.hbs into
    // dist/mail/templates alongside mail.service.js) — compiled once
    // at startup rather than per-send.
    const templatesDir = join(__dirname, 'templates');
    this.verificationTemplate = Handlebars.compile(
      fs.readFileSync(join(templatesDir, 'verification.hbs'), 'utf8'),
    );
    this.passwordResetTemplate = Handlebars.compile(
      fs.readFileSync(join(templatesDir, 'password-reset.hbs'), 'utf8'),
    );
  }

  private async sendViaBrevo(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<boolean> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    const fromEmail = this.configService.get<string>('MAIL_FROM');

    if (!apiKey || !fromEmail) {
      this.logger.error(
        'Cannot send email: BREVO_API_KEY or MAIL_FROM is not set',
      );
      return false;
    }

    try {
      await firstValueFrom(
        this.httpService.post(
          BREVO_API_URL,
          {
            sender: { email: fromEmail },
            to: [{ email: to }],
            subject,
            htmlContent,
          },
          {
            headers: {
              'api-key': apiKey,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 15000,
          },
        ),
      );
      return true;
    } catch (error: any) {
      // Brevo's rejection reason (bad API key, unverified sender,
      // etc.) is in error.response.data — surface that instead of just
      // the generic axios error so a bad send is actually diagnosable
      // from the Render logs.
      this.logger.error(
        `Failed to send email to ${to}: ${JSON.stringify(
          error?.response?.data || error?.message || error,
        )}`,
      );
      return false;
    }
  }

  async sendVerificationEmail(email: string, name: string, otpCode: string) {
    const html = this.verificationTemplate({ name, otpCode });
    return this.sendViaBrevo(email, 'Verify Your Email Address', html);
  }

  async sendPasswordResetEmail(email: string, name: string, otpCode: string) {
    const html = this.passwordResetTemplate({ name, otpCode });
    return this.sendViaBrevo(email, 'Reset Your Password', html);
  }
}
