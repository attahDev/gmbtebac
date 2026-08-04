import { Module } from '@nestjs/common';
import { ConcernController } from './concern.controller';
import { ConcernService } from './concern.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ConcernController],
  providers: [ConcernService],
})
export class ConcernModule {}
