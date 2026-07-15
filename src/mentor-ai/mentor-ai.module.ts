import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MentorAiService } from './mentor-ai.service';
import { MentorAiController } from './mentor-ai.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [HttpModule, PrismaModule],
  controllers: [MentorAiController],
  providers: [MentorAiService],
  exports: [MentorAiService],
})
export class MentorAiModule {}
