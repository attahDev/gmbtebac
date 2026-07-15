import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { BusinessPlannerService } from './business-planner.service';
import { GenerateBusinessPlanDto } from './dto/generate-business-plan.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';

@Controller('business-planner')
export class BusinessPlannerController {
    constructor(private readonly businessPlannerService: BusinessPlannerService) { }

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
    @Get('health')
    healthCheck() {
        return this.businessPlannerService.healthCheck();
    }
}