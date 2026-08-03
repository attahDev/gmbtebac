import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { GenerateBusinessPlanDto } from './dto/generate-business-plan.dto';
import { ActivityService } from 'src/engagement/activity/activity.service';
import { searchWeb, formatWebResultsForPrompt } from 'src/common/tavily-search';

const GROQ_MODEL = process.env.GROQ_EXTRACTION_MODEL || 'openai/gpt-oss-120b';

// Exact shape GeneratedPlanResult.tsx expects on the frontend — keep this in
// sync with the HF Space's own output shape so the Groq fallback is a drop-in
// replacement when the HF Space is unreachable.
const PLAN_JSON_SCHEMA = `{
  "summary_card": { "title": string, "description": string, "confidence_score": number (0-100) },
  "market_insights": {
    "demand": { "label": string, "score": number (0-10) },
    "competition": { "label": string, "score": number (0-10) },
    "opportunity": string
  },
  "feasibility_card": {
    "fit_score": number (0-100),
    "difficulty": string,
    "strengths": string[],
    "risks": string[]
  },
  "revenue_chart": {
    "model": string,
    "scalability": string,
    "projection": [{ "month": string, "revenue": number }]  // 6 months
  },
  "score_breakdown": { "market": number, "profit": number, "execution": number, "scalability": number },  // each 0-10
  "next_steps": string[]  // 3 items
}`;

@Injectable()
export class BusinessPlannerService {
  private readonly logger = new Logger(BusinessPlannerService.name);

  private readonly BASE_URL =
    process.env.BUSINESS_PLANNER_API_URL ||
    'https://olayimika01-business-plan.hf.space';

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
  ) {}

  async generatePlan(userId: string, payload: GenerateBusinessPlanDto) {
    let aiResponse: any;

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

      aiResponse = response.data;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.warn(
        `HF Space business planner unavailable (${
          error instanceof Error ? error.message : error
        }) — falling back to Groq`,
      );

      aiResponse = await this.generatePlanWithGroq(payload);

      if (!aiResponse) {
        if (error instanceof AxiosError) {
          this.logger.error(error.message, error.stack);
        }
        throw new BadRequestException(
          'Could not generate business plan — both the primary AI and the fallback are unavailable right now.',
        );
      }
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
        sourceIdeaId: payload.source_idea_id || null,
        aiResponse,
      },
    });

    await this.activityService.log(
      userId,
      'BUSINESS_PLAN_GENERATED',
      `Generated a business plan for "${payload.business_idea}"`,
      { planId: savedPlan.id },
    );

    return {
      success: true,
      message: 'Business plan generated and saved successfully',
      planId: savedPlan.id,
      data: aiResponse.data,
    };
  }

  /**
   * Fallback provider: Groq, grounded with a live Tavily search on the
   * user's specific idea/industry/location, in case the HF Space is down.
   * Best-effort — searchWeb() itself never throws (returns [] on failure),
   * so this only fails if Groq itself is unreachable or returns bad JSON.
   */
  private async generatePlanWithGroq(
    payload: GenerateBusinessPlanDto,
  ): Promise<{ success: true; data: any } | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      this.logger.warn('GROQ_API_KEY not set — no fallback available for Business Planner');
      return null;
    }

    const searchQuery = `${payload.business_idea} ${payload.industry} market ${payload.location}`;
    const webResults = await searchWeb(searchQuery, { maxResults: 4 });
    const webContext = formatWebResultsForPrompt(webResults);

    const systemContent = `You are a business analyst AI. Given a business idea, respond with ONLY a single valid JSON object (no markdown fences, no preamble, no commentary) matching exactly this schema:

${PLAN_JSON_SCHEMA}

Ground your analysis in real market conditions for the given industry and location wherever you have current information available.${
      webContext
        ? `\n\nCurrent web search results you can draw on for grounding (don't force them in if not relevant, and never quote them verbatim — synthesize in your own words):\n\n${webContext}`
        : ''
    }`;

    const userContent = `Business idea: ${payload.business_idea}
Industry: ${payload.industry}
Target audience: ${payload.target_audience}
Founder's skills: ${payload.skills}
Budget: ${payload.budget}
Location: ${payload.location}
Experience level: ${payload.experience_level}
Goal: ${payload.goal}`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent },
          ],
          temperature: 0.5,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        this.logger.error(`Groq fallback failed with status ${response.status}`);
        return null;
      }

      const payloadJson = await response.json();
      const raw = payloadJson?.choices?.[0]?.message?.content;
      if (typeof raw !== 'string' || raw.trim().length === 0) return null;

      const cleaned = raw.trim().replace(/^```json\s*|```$/g, '');
      const parsed = JSON.parse(cleaned);

      return { success: true, data: parsed };
    } catch (error) {
      this.logger.error(
        'Groq fallback call for business planner failed',
        error as Error,
      );
      return null;
    }
  }

  async getHistory(userId: string) {
    return this.prisma.businessPlan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(userId: string, planId: string) {
    const plan = await this.prisma.businessPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Business plan not found');
    }

    if (plan.userId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this business plan',
      );
    }

    return plan;
  }

  async updateProgress(
    userId: string,
    planId: string,
    completedActionIndexes: number[],
  ) {
    const plan = await this.prisma.businessPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Business plan not found');
    }

    if (plan.userId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this business plan',
      );
    }

    const updated = await this.prisma.businessPlan.update({
      where: { id: planId },
      data: { completedActionIndexes },
    });

    return {
      success: true,
      planId: updated.id,
      completedActionIndexes: updated.completedActionIndexes,
    };
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
