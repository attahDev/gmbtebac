import { Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  providers: [ContactService],
  controllers: [ContactController],
  imports: [PrismaModule],
  exports: [ContactModule],
})
export class ContactModule {}
