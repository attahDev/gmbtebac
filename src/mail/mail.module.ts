import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';

@Module({
  imports: [
    ConfigModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // console.log('MAIL_HOST:', configService.get('MAIL_HOST'));
        // console.log('MAIL_USER:', configService.get('MAIL_USER'));
        // console.log(
        //   'MAIL_PASS:',
        //   configService.get('MAIL_PASS') ? 'Loaded' : 'Missing',
        // );
        // console.log('MAIL_FROM:', configService.get('MAIL_FROM'));

        return {
          transport: {
            host: configService.get<string>('MAIL_HOST'),
            port: Number(configService.get<string>('MAIL_PORT')),
            secure: false, // for 587
            requireTLS: true, // 🔥 IMPORTANT
            auth: {
              user: configService.get<string>('MAIL_USER'),
              pass: configService.get<string>('MAIL_PASS'),
            },
            connectionTimeout: 30000, // 🔥 prevents timeout crash
            greetingTimeout: 30000,
            socketTimeout: 30000,
          },
          defaults: {
            from: configService.get<string>('MAIL_FROM'),
          },
          template: {
            dir: join(process.cwd(), 'src', 'mail', 'templates'),
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
