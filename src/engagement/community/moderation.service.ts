import { Injectable, Logger } from '@nestjs/common';

// Same model choice as career-paths.service.ts / pdf-extraction.service.ts —
// llama-3.3-70b-versatile is being retired by Groq, gpt-oss-120b is the
// current general-purpose stand-in.
const GROQ_MODEL = process.env.GROQ_MODERATION_MODEL || 'openai/gpt-oss-120b';

const MODERATION_SYSTEM_PROMPT = `You are a content moderator for a youth-focused professional community platform. Given a piece of user-submitted text (a post or a comment), decide whether it contains any of: hate speech or harassment, sexual content, graphic violence, spam/scams, doxxing/personal contact info shared without consent, or profanity/vulgar or crude language (swear words, curse words — flag these even without any other violation present). Respond with ONLY valid JSON, no markdown fences, matching exactly:
{
  "flagged": boolean,
  "reason": string (one short sentence explaining why, empty string if not flagged)
}
Be conservative about everything except profanity — normal community shoutouts, career updates, and constructive criticism are NOT flagged. But any swearing or crude language, even mild and even with no other issue, should be flagged.`;

export type ModerationResult = {
  flagged: boolean;
  reason: string;
};

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  /** Fails open (flagged: false) on any error — a moderation-service outage
   *  should never be the reason a legitimate post silently stays live but
   *  un-checked; the admin queue is the safety net, not this call. */
  async checkText(text: string): Promise<ModerationResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return { flagged: false, reason: '' };

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: MODERATION_SYSTEM_PROMPT },
            { role: 'user', content: text },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Moderation call failed: ${response.status}`);
        return { flagged: false, reason: '' };
      }

      const payload = await response.json();
      const raw = payload?.choices?.[0]?.message?.content;
      if (!raw) return { flagged: false, reason: '' };

      const parsed = JSON.parse(raw);
      return {
        flagged: Boolean(parsed?.flagged),
        reason: typeof parsed?.reason === 'string' ? parsed.reason : '',
      };
    } catch (err) {
      this.logger.warn(`Moderation call threw: ${(err as Error).message}`);
      return { flagged: false, reason: '' };
    }
  }
}
