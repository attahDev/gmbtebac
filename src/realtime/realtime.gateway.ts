import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One shared gateway for every "don't make me refresh the page" feature
 * (Opportunities, Badges, Mentors, mentor/mentee Chat...) instead of a
 * separate gateway per module. Services just inject this and call
 * broadcast() / emitToUser() / emitToRoom() after a mutation — the
 * frontend either gets a push (socket connected) or falls back to its own
 * short poll (see src/lib/useLiveSignal.ts on the frontend), so nothing
 * ever depends solely on the socket staying up (Render free tier sleeps).
 */
@WebSocketGateway({
  cors: {
    origin: [
      'https://www.gmblacktechexpo.co.uk',
      'https://frogmbte.vercel.app'
    ],
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer() server: Server;

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  /** Authenticated clients auto-join a room keyed to their own user id, so
   *  any service can push a private event (e.g. "you earned a badge")
   *  straight to one person via emitToUser() without the client asking
   *  for it first. Anonymous/expired-token sockets still connect — they
   *  just don't get a personal room, only sitewide broadcasts (e.g. the
   *  public Opportunities list). */
  async handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '');

    if (!token) return;

    try {
      const payload = await this.jwt.verifyAsync(token);
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
    } catch {
      this.logger.debug('Socket connected with an invalid/expired token (treated as anonymous)');
    }
  }

  /** Mentor <-> mentee chat is 1:1 and private, so messages go to a room
   *  scoped to the connectionId rather than a broadcast. A client has to
   *  explicitly ask to join, and we verify they're actually one of the two
   *  people on that connection before letting them in — same check
   *  MentorsService.assertConnectionMember() does over REST. */
  @SubscribeMessage('chat:join')
  async handleChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { connectionId?: string },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data?.connectionId) return { ok: false };

    const connection = await this.prisma.mentorConnection.findUnique({
      where: { id: data.connectionId },
      include: { mentor: true },
    });

    const isMember = !!connection && (connection.userId === userId || connection.mentor.userId === userId);
    if (!isMember) return { ok: false };

    client.join(`chat:${data.connectionId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat:leave')
  handleChatLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { connectionId?: string }) {
    if (data?.connectionId) client.leave(`chat:${data.connectionId}`);
  }

  // ───────────────────────── Emit helpers used by services ─────────────────────────

  /** Sitewide push — anyone connected gets it. For public data that isn't
   *  tied to one user: Opportunities list, the mentor directory. */
  broadcast(event: string, payload?: unknown) {
    this.server?.emit(event, payload ?? null);
  }

  /** Private push to one user's personal room — "you earned a badge",
   *  "your connection request was accepted", etc. */
  emitToUser(userId: string, event: string, payload?: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload ?? null);
  }

  /** Push to whoever currently has a specific chat thread open. */
  emitToRoom(room: string, event: string, payload?: unknown) {
    this.server?.to(room).emit(event, payload ?? null);
  }
}
