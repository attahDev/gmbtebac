import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { GenerateBusinessPlanDto } from './dto/generate-business-plan.dto';

@Injectable()
export class BusinessPlannerService {
  private readonly logger = new Logger(BusinessPlannerService.name);

  private readonly BASE_URL =
    process.env.BUSINESS_PLANNER_API_URL ||
    'https://olayimika01-business-plan.hf.space';

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  async generatePlan(userId: string, payload: GenerateBusinessPlanDto) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.BASE_URL}/generate-plan`, payload, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );

      if (!response.data?.success) {
        throw new BadRequestException(
          response.data?.error || 'Failed to generate business plan',
        );
      }

      const savedPlan = await this.prisma.businessPlan.create({
        data: {
          userId,
          businessIdea: payload.business_idea,
          industry: payload.industry,
          targetAudience: payload.target_audience,
          skills: payload.skills,
          budget: payload.budget,
          location: payload.location,
          experienceLevel: payload.experience_level,
          goal: payload.goal,
          aiResponse: response.data,
        },
      });

      return {
        success: true,
        message: 'Business plan generated and saved successfully',
        planId: savedPlan.id,
        data: response.data.data,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error instanceof AxiosError) {
        this.logger.error(error.message, error.stack);

        throw new BadRequestException(
          error.response?.data?.error ||
            'Could not connect to Business Planner AI',
        );
      }

      throw new BadRequestException(
        'Something went wrong while generating business plan',
      );
    }
  }

  async getHistory(userId: string) {
    return this.prisma.businessPlan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async healthCheck() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.BASE_URL, {
          timeout: 10000,
        }),
      );

      return response.data;
    } catch {
      throw new BadRequestException('Business Planner API is not reachable');
    }
  }
}