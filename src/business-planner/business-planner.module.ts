import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from 'src/prisma/prisma.module';
import { BusinessPlannerController } from './business-planner.controller';
import { BusinessPlannerService } from './business-planner.service';

@Module({
  imports: [HttpModule, PrismaModule],
  controllers: [BusinessPlannerController],
  providers: [BusinessPlannerService],
  exports: [BusinessPlannerService],
})
export class BusinessPlannerModule {}