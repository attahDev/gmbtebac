/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import { sanitizeAiText } from 'src/common/sanitize-ai-text';
import { searchWeb, formatWebResultsForPrompt } from 'src/common/tavily-search';
import { ActivityService } from 'src/engagement/activity/activity.service';
import { isIdentityQuestion, samIdentityAnswer } from './sam-identity';

// ─── Types ─────────────────────────────────────────────────────────────
type ChatRole = 'user' | 'assistant';

interface AiHistoryItem {
  role: ChatRole;
  content: string;
}

interface AiApiResponse {
  response: string;
}

interface AiRequestBody {
  message: string;
  history: AiHistoryItem[];
}

const GROQ_MODEL = process.env.GROQ_EXTRACTION_MODEL || 'openai/gpt-oss-120b';

const MENTOR_SYSTEM_PROMPT = `You are the GMBTE Business Mentor AI — a warm, practical, encouraging mentor for Black entrepreneurs and tech talent in the UK using the Greater Manchester Black Tech Expo (GMBTE) platform. Give concrete, actionable business advice (pricing, strategy, validation, funding, operations, growth) grounded in the UK context — use GBP (£) for any figures, and where relevant point to UK-specific routes like Companies House registration, UK business bank accounts, GOV.UK Start Up Loans, regional funds (e.g. Greater Manchester Combined Authority, Innovate UK, the British Business Bank), and the Manchester/North West startup ecosystem rather than defaulting to examples from elsewhere. Keep answers conversational and focused — a few short paragraphs, not an essay, unless the user asks for depth. Write in plain conversational text only — no markdown formatting (no #, **, tables, or --- dividers); use plain sentences and, if you need a list, simple dashes on their own lines. Don't mention that you're a fallback or backup system.`;

// ─── Service ───────────────────────────────────────────────────────────
@Injectable()
export class MentorAiService {
  private readonly logger = new Logger(MentorAiService.name);

  // Maximum number of previous messages sent to the AI
  private readonly MAX_HISTORY_LENGTH = 10;

  // Base URL should come from configuration (environment variable)
  private readonly AI_API_URL =
    process.env.MENTOR_AI_API_URL ?? 'https://olayimika01-gmbte1.hf.space/chat';

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly activityService: ActivityService,
  ) {}

  /**
   * Main chat entry point.
   * @returns The chat id and the assistant’s reply.
   */
  async chat(
    userId: string,
    message: string,
    chatId?: string,
    persona: 'sam' | 'business_mentor' = 'business_mentor',
  ): Promise<{ chatId: string; reply: string }> {
    if (!message?.trim()) {
      throw new BadRequestException('Message is required');
    }

    // 1. Resolve or create the conversation
    const isNewChat = !chatId;
    const chat = await this.resolveChat(userId, message, chatId);

    if (isNewChat) {
      await this.activityService.log(
        userId,
        'MENTOR_AI_CHAT',
        'Started a conversation with the Business Mentor AI',
        { chatId: chat.id },
      );
    }

    // 2. Save the user message
    await this.prisma.mentorMessage.create({
      data: {
        chatId: chat.id,
        role: 'USER',
        content: message,
      },
    });

    // Direct identity questions never hit the AI provider — for Sam (the
    // standalone My Mentor page) they're answered instantly and on-brand.
    // The Business Studio widget keeps its original unnamed behavior.
    if (persona === 'sam' && isIdentityQuestion(message)) {
      const answer = samIdentityAnswer();

      const assistantMessage = await this.prisma.mentorMessage.create({
        data: {
          chatId: chat.id,
          role: 'ASSISTANT',
          content: answer,
        },
      });

      await this.prisma.mentorChat.update({
        where: { id: chat.id },
        data: {},
      });

      return {
        chatId: chat.id,
        reply: assistantMessage.content,
      };
    }

    // 3. Build AI‑ready history (limited length)
    const history = await this.buildHistory(chat.id);

    // 4. Call the AI API
    const aiReply = sanitizeAiText(await this.fetchAiReply(message, history));

    // 5. Persist the assistant message
    const assistantMessage = await this.prisma.mentorMessage.create({
      data: {
        chatId: chat.id,
        role: 'ASSISTANT',
        content: aiReply,
      },
    });

    this.logger.log(`Chat ${chat.id}: replied successfully`);

    // @updatedAt only bumps when the MentorChat row itself is written, not
    // when related messages are created — touch it so listChats() sorts by
    // actual last-activity instead of just creation time.
    await this.prisma.mentorChat.update({
      where: { id: chat.id },
      data: {},
    });

    return {
      chatId: chat.id,
      reply: assistantMessage.content,
    };
  }

  // ─── Resuming past conversations ──────────────────────────────────────

  /** Chats for the sidebar/history list — title + most recent activity,
   *  no message bodies (keep the list call cheap). */
  async listChats(userId: string) {
    return this.prisma.mentorChat.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  /** Full message history for one chat, so the frontend can hydrate the
   *  conversation instead of always starting the UI from a blank slate. */
  async getChat(userId: string, chatId: string) {
    const chat = await this.prisma.mentorChat.findFirst({
      where: { id: chatId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!chat) {
      throw new BadRequestException('Chat not found');
    }

    return chat;
  }

  // ─── Private helpers ─────────────────────────────────────────────────

  /**
   * Finds an existing chat or creates a new one with a generated title.
   */
  private async resolveChat(userId: string, message: string, chatId?: string) {
    if (chatId) {
      const existing = await this.prisma.mentorChat.findFirst({
        where: { id: chatId, userId },
      });
      if (!existing) {
        throw new BadRequestException('Chat not found');
      }
      return existing;
    }

    return this.prisma.mentorChat.create({
      data: {
        userId,
        title: message.slice(0, 100), // you may want to sanitise or truncate
      },
    });
  }

  /**
   * Retrieves the last N messages and maps them to the AI’s history format.
   */
  private async buildHistory(chatId: string): Promise<AiHistoryItem[]> {
    const messages = await this.prisma.mentorMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      take: this.MAX_HISTORY_LENGTH + 1, // +1 because the current user message is already saved
    });

    // Remove the very last message (the one just sent) to avoid duplication.
    // The AI will receive it as the `message` parameter anyway.
    const relevant = messages.slice(0, -1);

    return relevant.map((msg) => ({
      role: msg.role === 'USER' ? 'user' : 'assistant',
      content: msg.content,
    }));
  }

  /**
   * Sends a request to the external AI service and extracts the reply.
   * Throws meaningful errors for timeouts, non‑2xx responses, or malformed data.
   */
  private async fetchAiReply(
    message: string,
    history: AiHistoryItem[],
  ): Promise<string> {
    try {
      return await this.fetchFromHfSpace(message, history);
    } catch (error) {
      this.logger.warn(
        `Hugging Face mentor Space failed (${error instanceof Error ? error.message : 'unknown error'}), falling back to Groq`,
      );

      const groqReply = await this.fetchFromGroq(message, history);
      if (groqReply) return groqReply;

      // Both providers failed — surface a real error.
      if (error instanceof AxiosError) {
        throw new BadRequestException(
          error.response
            ? `Mentor AI service returned ${error.response.status}`
            : 'Mentor AI is temporarily unavailable — please try again in a moment',
        );
      }
      throw new BadRequestException(
        'Mentor AI is temporarily unavailable — please try again in a moment',
      );
    }
  }

  /** Primary provider: the dedicated fine-tuned mentor Space. One retry covers a cold start. */
  private async fetchFromHfSpace(
    message: string,
    history: AiHistoryItem[],
  ): Promise<string> {
    const body: AiRequestBody = { message, history };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response: AxiosResponse<AiApiResponse> = await firstValueFrom(
          this.httpService.post<AiApiResponse>(this.AI_API_URL, body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: attempt === 1 ? 15_000 : 20_000,
          }),
        );

        const reply = response.data?.response;
        if (typeof reply !== 'string' || reply.trim().length === 0) {
          throw new BadRequestException('AI returned an empty or invalid response');
        }
        return reply;
      } catch (error) {
        const isRetryable =
          error instanceof AxiosError && (error.code === 'ECONNABORTED' || !error.response);

        if (isRetryable && attempt === 1) {
          this.logger.warn(`HF Space attempt 1 failed (${error.message}), retrying once`);
          continue;
        }
        throw error;
      }
    }

    throw new Error('Mentor Space unreachable');
  }

  /** Fallback provider: Groq, given the same conversation, in case the HF Space is down. */
  private async fetchFromGroq(
    message: string,
    history: AiHistoryItem[],
  ): Promise<string | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      this.logger.warn('GROQ_API_KEY not set — no fallback available for Mentor AI');
      return null;
    }

    // Best-effort: ground the answer in current info Groq's training data
    // can't know (grant deadlines, current schemes, recent news) — never
    // blocks the reply if Tavily is unavailable or unhelpful.
    const webResults = await searchWeb(`${message} UK`, { maxResults: 4 });
    const webContext = formatWebResultsForPrompt(webResults);

    const systemContent = webContext
      ? `${MENTOR_SYSTEM_PROMPT}\n\nCurrent web search results you can draw on if relevant to the question (cite naturally, e.g. "as of a recent search..." — don't force it in if not relevant):\n\n${webContext}`
      : MENTOR_SYSTEM_PROMPT;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: systemContent },
            ...history.map((h) => ({ role: h.role, content: h.content })),
            { role: 'user', content: message },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        this.logger.error(`Groq fallback failed with status ${response.status}`);
        return null;
      }

      const payload = await response.json();
      const reply = payload?.choices?.[0]?.message?.content;
      return typeof reply === 'string' && reply.trim().length > 0 ? reply : null;
    } catch (error) {
      this.logger.error('Groq fallback call failed', error as Error);
      return null;
    }
  }
}
