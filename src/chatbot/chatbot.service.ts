/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ChatSender, ChatVisitorType } from '@prisma/client';
import { isIdentityQuestion, noraIdentityAnswer } from 'src/common/rewrite-bot-identity';
import { buildPlatformContext } from './platform-context';

const GROQ_MODEL = process.env.GROQ_NORA_MODEL || 'openai/gpt-oss-120b';
const MAX_HISTORY_MESSAGES = 12;

// Grounds Nora's routing suggestions in pages that actually exist, instead
// of letting the model invent a plausible-looking path. Key = route shown
// to the frontend as a button target, value = what it's for (used only in
// the prompt, never shown to the user).
const KNOWN_ROUTES: Record<string, string> = {
  '/dashboard/opportunities': 'job and opportunity listings',
  '/dashboard/mentors': 'browse mentors',
  '/dashboard/mentors/find': 'find/match with a mentor',
  '/dashboard/mentors-ai': 'the Mentor AI (Sam) chat',
  '/dashboard/courses': 'course catalogue / Academy',
  '/dashboard/green-impact': 'sustainability / Green Impact courses',
  '/dashboard/events': 'upcoming events',
  '/dashboard/community': 'community feed',
  '/dashboard/ai-studio': 'AI Business Studio (idea generator, business plan, market research)',
  '/dashboard/idea-generator': 'business idea generator',
  '/dashboard/business-plan': 'business plan builder',
  '/dashboard/market-research': 'market research tool',
  '/dashboard/brand-identity': 'brand identity / logo builder',
  '/dashboard/id-generator': 'ID card generator',
  '/dashboard/profile': 'user profile/settings',
  '/hall-of-fame': 'Hall of Fame (alumni spotlight)',
  '/partners': 'partner organizations',
  '/careers': 'careers page',
};

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(userId: string | null, payload: SendChatMessageDto) {
    let sessionId = payload.sessionId;

    if (!sessionId) {
      const session = await this.prisma.chatSession.create({
        data: {
          userId: userId || undefined,
          visitorType: payload.visitorType || ChatVisitorType.UNKNOWN,
          title: payload.message.slice(0, 60),
        },
      });
      sessionId = session.id;
    }

    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: MAX_HISTORY_MESSAGES } },
    });

    if (!session) {
      throw new BadRequestException('Chat session not found');
    }

    // A session created anonymously and later continued by a logged-in
    // user (token appears mid-conversation) gets attached to that user —
    // otherwise it'd stay orphaned and never show up in getHistory().
    if (userId && !session.userId) {
      await this.prisma.chatSession.update({ where: { id: sessionId }, data: { userId } });
    }

    await this.prisma.chatMessage.create({
      data: { sessionId, sender: ChatSender.USER, content: payload.message },
    });

    // Identity questions never hit the model — answered directly as Nora.
    if (isIdentityQuestion(payload.message)) {
      const answer = noraIdentityAnswer();
      await this.prisma.chatMessage.create({
        data: { sessionId, sender: ChatSender.BOT, content: answer, aiStatus: 'success' },
      });
      return { success: true, message: 'Chat response generated successfully', data: { sessionId, answer, suggestedRoute: null } };
    }

    try {
      const { reply, suggestedRoute } = await this.callGroq(session.messages, payload.message);

      await this.prisma.chatMessage.create({
        data: {
          sessionId,
          sender: ChatSender.BOT,
          content: reply,
          aiStatus: 'success',
          suggestedRoute,
        },
      });

      return {
        success: true,
        message: 'Chat response generated successfully',
        data: { sessionId, answer: reply, suggestedRoute },
      };
    } catch (error) {
      this.logger.error((error as Error).message, (error as Error).stack);

      const fallback = "Sorry, I'm having trouble responding right now — mind trying again in a moment?";
      await this.prisma.chatMessage.create({
        data: { sessionId, sender: ChatSender.BOT, content: fallback, aiStatus: 'error' },
      });

      return { success: true, message: 'Chat response generated successfully', data: { sessionId, answer: fallback, suggestedRoute: null } };
    }
  }

  private async callGroq(
    history: { sender: ChatSender; content: string }[],
    latestMessage: string,
  ): Promise<{ reply: string; suggestedRoute: string | null }> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not configured');

    const platformContext = await buildPlatformContext(this.prisma);
    const routeList = Object.entries(KNOWN_ROUTES)
      .map(([path, desc]) => `${path} — ${desc}`)
      .join('\n');

    const systemPrompt = `You are Nora, the friendly main assistant for GMBTE, a youth-focused professional development platform (fellowships, mentorship, courses, events, an AI business studio, and a hall of fame of alumni). Be warm, concise, and genuinely helpful — a couple of short paragraphs at most.

${platformContext ? platformContext + '\n\n' : ''}Pages you can send someone to (use the exact path as suggestedRoute, or null if nothing fits):
${routeList}

Respond with ONLY valid JSON, no markdown fences, matching exactly:
{
  "reply": string,
  "suggestedRoute": string or null
}
Only set suggestedRoute when the conversation clearly points to one specific page — don't force it on every reply.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role: m.sender === ChatSender.USER ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: latestMessage },
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.6,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq call failed: ${response.status}`);
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty Groq response');

    const parsed = JSON.parse(raw);
    const suggestedRoute =
      typeof parsed?.suggestedRoute === 'string' && KNOWN_ROUTES[parsed.suggestedRoute]
        ? parsed.suggestedRoute
        : null;

    return {
      reply: typeof parsed?.reply === 'string' ? parsed.reply : "I'm not sure how to answer that — could you rephrase?",
      suggestedRoute,
    };
  }

  async getHistory(userId: string) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSession(sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) {
      throw new BadRequestException('Chat session not found');
    }

    return session;
  }

  async healthCheck() {
    return { status: process.env.GROQ_API_KEY ? 'ok' : 'missing GROQ_API_KEY' };
  }

  // ---------------- ADMIN: knowledge articles ----------------

  async listKnowledge() {
    return this.prisma.knowledgeArticle.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async createKnowledge(data: { title: string; body: string; category?: string }) {
    return this.prisma.knowledgeArticle.create({ data });
  }

  async updateKnowledge(
    id: string,
    data: { title?: string; body?: string; category?: string; isActive?: boolean },
  ) {
    return this.prisma.knowledgeArticle.update({ where: { id }, data });
  }

  async deleteKnowledge(id: string) {
    await this.prisma.knowledgeArticle.delete({ where: { id } });
    return { removed: true };
  }
}
