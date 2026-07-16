import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';
import { OtpModule } from './otp/otp.module';
import { ConfigModule } from '@nestjs/config';
import { RefreshTokenModule } from './refresh-token/refresh-token.module';
import { ContactModule } from './contact/contact.module';
import { ThrottlerModule } from '@nestjs/throttler';

import { MentorAiModule } from './mentor-ai/mentor-ai.module';
import { BusinessPlannerModule } from './business-planner/business-planner.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { BrandIdentityModule } from './brand-identity/brand-identity.module';
import { EngagementModule } from './engagement/engagement.module';


@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60, // seconds
        limit: 10, // max 10 requests per minute per IP
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MailModule,
    OtpModule,
    RefreshTokenModule,
    ContactModule,
    ContactModule,
    MentorAiModule,
    BusinessPlannerModule,
    ChatbotModule,
    BrandIdentityModule,
    EngagementModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
