import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private configService: ConfigService,
  ) {}

  async sendVerificationEmail(email: string, name: string, otpCode: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Verify Your Email Address',
        template: './verification',
        context: {
          name,
          otpCode,
        },
      });
      return true;
    } catch (error) {
      // Previously this was the ONLY trace of a failed send — register()
      // and resendVerificationEmail() both ignored the return value and
      // told the user it worked regardless. Logging the recipient here so
      // a bad send is at least greppable in the Render logs even before
      // the caller-side fix below.
      console.error(`Failed to send verification email to ${email}:`, error);
      return false;
    }
  }
  async sendPasswordResetEmail(email: string, name: string, otpCode: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Reset Your Password',
        template: './password-reset',
        context: {
          name,
          otpCode,
        },
      });
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
}
