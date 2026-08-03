import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { sanitizeAiText } from 'src/common/sanitize-ai-text';
import { ActivityService } from 'src/engagement/activity/activity.service';
import { isIdentityQuestion, pelumiIdentityAnswer, applyPelumiVoice } from './pelumi-identity';

interface HofApiResponse {
  answer?: string;
  response?: string;
  message?: string;
  result?: string;
  data?: { answer?: string; response?: string; message?: string };
}

/**
 * Proxies chat to the dedicated Hall of Fame AI model (already trained /
 * RAG'd on inductees, categories, and legacy stories). Routing it through
 * the backend — instead of the frontend calling the HF Space directly —
 * means the space URL stays server-side and the endpoint is auth-gated
 * like every other AI agent on the platform.
 */
@Injectable()
export class HofAiService {
  private readonly logger = new Logger(HofAiService.name);

  private readonly AI_API_URL =
    process.env.HOF_AI_API_URL ??
    'https://olayimika01-hall-of-fame.hf.space/api/v1/chat';

  constructor(private readonly activityService: ActivityService) {}

  async chat(message: string, userId?: string): Promise<{ reply: string }> {
    if (!message?.trim()) {
      throw new BadRequestException('Message is required');
    }

    // Direct identity questions skip the Space entirely — it has no
    // concept of "Pelumi", so answer on-brand without a round trip.
    if (isIdentityQuestion(message)) {
      return { reply: pelumiIdentityAnswer() };
    }

    try {
      const response = await fetch(this.AI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: message }),
      });

      if (!response.ok) {
        throw new BadRequestException(
          `Hall of Fame AI request failed with status ${response.status}`,
        );
      }

      const data = (await response.json()) as HofApiResponse;
      const reply =
        data.answer ||
        data.response ||
        data.message ||
        data.result ||
        data.data?.answer ||
        data.data?.response ||
        data.data?.message;

      if (!reply) {
        throw new BadRequestException('Hall of Fame AI returned an empty response');
      }

      if (userId) {
        await this.activityService.logThrottled(
          userId,
          'HOF_AI_CHAT',
          'Asked the Hall of Fame AI a question',
        );
      }

      // The Space gives us the facts; Pelumi's voice pass makes it sound
      // like her without touching any of the actual content.
      const factual = sanitizeAiText(reply);
      const voiced = await applyPelumiVoice(factual);

      return { reply: voiced };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Hall of Fame AI call failed', error as Error);
      throw new BadRequestException('Could not reach the Hall of Fame AI right now');
    }
  }
}
