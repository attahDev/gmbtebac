/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';

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
  ) {}

  /**
   * Main chat entry point.
   * @returns The chat id and the assistant’s reply.
   */
  async chat(
    userId: string,
    message: string,
    chatId?: string,
  ): Promise<{ chatId: string; reply: string }> {
    if (!message?.trim()) {
      throw new BadRequestException('Message is required');
    }

    // 1. Resolve or create the conversation
    const chat = await this.resolveChat(userId, message, chatId);

    // 2. Save the user message
    await this.prisma.mentorMessage.create({
      data: {
        chatId: chat.id,
        role: 'USER',
        content: message,
      },
    });

    // 3. Build AI‑ready history (limited length)
    const history = await this.buildHistory(chat.id);

    // 4. Call the AI API
    const aiReply = await this.fetchAiReply(message, history);

    // 5. Persist the assistant message
    const assistantMessage = await this.prisma.mentorMessage.create({
      data: {
        chatId: chat.id,
        role: 'ASSISTANT',
        content: aiReply,
      },
    });

    this.logger.log(`Chat ${chat.id}: replied successfully`);
    return {
      chatId: chat.id,
      reply: assistantMessage.content,
    };
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
    const body: AiRequestBody = { message, history };

    try {
      const response: AxiosResponse<AiApiResponse> = await firstValueFrom(
        this.httpService.post<AiApiResponse>(this.AI_API_URL, body, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15_000, // 15s timeout – adjust as needed
        }),
      );

      const reply = response.data?.response;
      if (typeof reply !== 'string' || reply.trim().length === 0) {
        throw new BadRequestException(
          'AI returned an empty or invalid response',
        );
      }
      return reply;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error; // re‑throw our own validation error
      }

      if (error instanceof AxiosError) {
        this.logger.error(
          `AI API request failed: ${error.message}`,
          error.stack,
        );
        throw new BadRequestException(
          `Failed to get AI response: ${error.response?.status ?? 'Network error'}`,
        );
      }

      // Unexpected error (programming mistake)
      this.logger.error('Unexpected error during AI call', error);
      throw new BadRequestException(
        'An internal error occurred while contacting the AI service',
      );
    }
  }
}
