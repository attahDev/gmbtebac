/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ChatSender, ChatVisitorType } from '@prisma/client';

@Injectable()
export class ChatbotService {
    private readonly logger = new Logger(ChatbotService.name);

    private readonly BASE_URL =
        process.env.CHATBOT_API_URL ||
        'https://olayimika01-gmbte-chat.hf.space/api/v1/chat';

    constructor(
        private readonly httpService: HttpService,
        private readonly prisma: PrismaService,
    ) { }

    async sendMessage(userId: string | null, payload: SendChatMessageDto) {
        try {
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
            });

            if (!session) {
                throw new BadRequestException('Chat session not found');
            }

            await this.prisma.chatMessage.create({
                data: {
                    sessionId,
                    sender: ChatSender.USER,
                    content: payload.message,
                },
            });

            const response = await firstValueFrom(
                this.httpService.post(
                    this.BASE_URL,
                    {
                        query: payload.message,
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        timeout: 30000,
                    },
                ),
            );

            if (response.data?.status !== 'success') {
                throw new BadRequestException(
                    response.data?.answer || 'Failed to get chatbot response',
                );
            }

            const answer = response.data?.answer || 'No response received.';

            await this.prisma.chatMessage.create({
                data: {
                    sessionId,
                    sender: ChatSender.BOT,
                    content: answer,
                    aiStatus: response.data?.status,
                    aiRawReply: response.data,
                },
            });

            return {
                success: true,
                message: 'Chat response generated successfully',
                data: {
                    sessionId,
                    answer,
                },
            };
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }

            if (error instanceof AxiosError) {
                this.logger.error(error.message, error.stack);

                throw new BadRequestException(
                    error.response?.data?.answer || 'Could not connect to Chatbot AI',
                );
            }

            throw new BadRequestException(
                'Something went wrong while generating chat response',
            );
        }
    }

    async getHistory(userId: string) {
        return this.prisma.chatSession.findMany({
            where: { userId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getSession(sessionId: string) {
        const session = await this.prisma.chatSession.findUnique({
            where: { id: sessionId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!session) {
            throw new BadRequestException('Chat session not found');
        }

        return session;
    }

    async healthCheck() {
        try {
            const response = await firstValueFrom(
                this.httpService.post(
                    this.BASE_URL,
                    { query: 'Hello' },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        timeout: 10000,
                    },
                ),
            );

            return response.data;
        } catch {
            throw new BadRequestException('Chatbot API is not reachable');
        }
    }
}