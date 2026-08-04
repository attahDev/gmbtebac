import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BusinessPlannerService } from './business-planner.service';
import { GenerateBusinessPlanDto } from './dto/generate-business-plan.dto';
import { UpdatePlanProgressDto } from './dto/update-plan-progress.dto';
import { UpdateRoadmapProgressDto } from './dto/update-roadmap-progress.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';

@Controller('business-planner')
export class BusinessPlannerController {
  constructor(
    private readonly businessPlannerService: BusinessPlannerService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('generate')
  generatePlan(@Req() req: any, @Body() body: GenerateBusinessPlanDto) {
    return this.businessPlannerService.generatePlan(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  getHistory(@Req() req: any) {
    return this.businessPlannerService.getHistory(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/progress')
  updateProgress(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdatePlanProgressDto,
  ) {
    return this.businessPlannerService.updateProgress(
      req.user.userId,
      id,
      body.completedActionIndexes,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/roadmap-progress')
  updateRoadmapProgress(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateRoadmapProgressDto,
  ) {
    return this.businessPlannerService.updateRoadmapProgress(
      req.user.userId,
      id,
      body.completedRoadmapItems,
    );
  }

  @Get('health')
  healthCheck() {
    return this.businessPlannerService.healthCheck();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.businessPlannerService.getById(req.user.userId, id);
  }
}
