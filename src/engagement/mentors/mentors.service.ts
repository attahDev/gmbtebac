import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { BadgesService } from '../badges/badges.service';
import { MentorConnectionStatus, UserRole } from '@prisma/client';
import { CreateMentorDto } from './dto/create-mentor.dto';
import { UpdateMentorDto } from './dto/update-mentor.dto';
import { PromoteMentorDto } from './dto/promote-mentor.dto';
import { UpdateMenteeConnectionDto } from './dto/update-mentee-connection.dto';
import { CreateMentorSpotlightDto } from './dto/create-mentor-spotlight.dto';
import { UpdateMentorSpotlightDto } from './dto/update-mentor-spotlight.dto';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

@Injectable()
export class MentorsService {
  constructor(
    private prisma: PrismaService,
    private activityService: ActivityService,
    private badgesService: BadgesService,
    private realtime: RealtimeGateway,
  ) {}

  /** Public mentor directory (used by "Find a Mentor"). */
  async findAll(skill?: string) {
    return this.prisma.mentor.findMany({
      where: {
        isActive: true,
        ...(skill ? { skills: { has: skill } } : {}),
      },
      // Grouped by admin-assigned category first, newest within each
      // category second — keeps the directory organized instead of one
      // flat reverse-chronological list.
      orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** Mentors the current user is actually connected to (used by "My Mentors"). */
  async findMyMentors(userId: string) {
    const connections = await this.prisma.mentorConnection.findMany({
      where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: { mentor: true },
      orderBy: { updatedAt: 'desc' },
    });

    return connections.map((c) => ({
      connectionId: c.id,
      status: c.status,
      sessionsCompleted: c.sessionsCompleted,
      nextSessionAt: c.nextSessionAt,
      mentor: c.mentor,
    }));
  }

  async connect(userId: string, mentorId: string) {
    const mentor = await this.prisma.mentor.findUnique({ where: { id: mentorId } });
    if (!mentor) throw new NotFoundException('Mentor not found');

    const existing = await this.prisma.mentorConnection.findUnique({
      where: { userId_mentorId: { userId, mentorId } },
    });
    if (existing) throw new ConflictException('Already connected to this mentor');

    const connection = await this.prisma.mentorConnection.create({
      data: { userId, mentorId, status: MentorConnectionStatus.PENDING },
      include: { mentor: true },
    });

    await this.activityService.log(
      userId,
      'MENTOR_CONNECT_REQUESTED',
      `Requested a connection with ${mentor.name}`,
      { mentorId },
    );

    // The mentee's own "My Mentors" list just gained a row, and — if this
    // mentor is a real logged-in user, not an admin-entered profile — their
    // "My Mentees" list just gained a pending request.
    this.realtime.emitToUser(userId, 'mentors:updated');
    if (mentor.userId) this.realtime.emitToUser(mentor.userId, 'mentors:updated');

    return connection;
  }

  /** Real numbers for the "My Mentors" stats row (was hardcoded 12 / 23 / +8 / 75%). */
  async stats(userId: string) {
    const connections = await this.prisma.mentorConnection.findMany({
      where: { userId },
      include: { mentor: true },
    });

    const totalSessions = await this.prisma.mentorSession.count({
      where: { connection: { userId }, status: 'COMPLETED' },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const networkGrowth = connections.filter((c) => c.createdAt >= thirtyDaysAgo).length;

    // "Skills developed" now counts distinct skills the mentee actually logged
    // (see SkillLog), not skills tagged on the mentor's own profile — a mentee
    // was previously credited for skills they'd never engaged with at all.
    const [skillLogs, coursesCompleted, eventsAttended] = await Promise.all([
      this.prisma.skillLog.findMany({ where: { menteeId: userId }, select: { skillName: true } }),
      this.prisma.courseProgress.count({ where: { userId, isCompleted: true } }),
      this.prisma.eventAttendance.count({ where: { userId } }),
    ]);
    const skillsDeveloped = new Set(skillLogs.map((s) => s.skillName.trim().toLowerCase())).size;

    // Simple, transparent heuristic: readiness grows with sessions, courses,
    // events, and now logged skills — capped at 100. Documented so product can
    // tune the weights later instead of it being a fixed "75%" nobody could
    // explain. See CareerPathsService#getMyReadiness for the path-aware version
    // that supersedes this once a mentee has picked a target career path.
    const careerReadiness = Math.min(
      100,
      totalSessions * 6 + coursesCompleted * 10 + eventsAttended * 4 + skillsDeveloped * 5,
    );

    return {
      skillsDeveloped,
      totalSessions,
      networkGrowth,
      careerReadinessPercent: careerReadiness,
    };
  }

  // ───────────────────────── Skill logging (mentee-reported, mentor-confirmable) ─────────────────────────

  /** Mentee logs a skill they learned within a connection, optionally tied to a session moment.
   *
   *  Free-text skill names get normalized against the mentee's chosen career
   *  path's required-skill list where possible (e.g. "React.js" / "reactjs"
   *  both resolve to whatever exact string the path uses, "React"), so
   *  readiness matching in CareerPathsService doesn't silently miss things
   *  that are really the same skill. Falls back to the raw trimmed input if
   *  there's no career goal set, no close match, or AI is unavailable —
   *  normalization is a nice-to-have, never a blocker on logging. */
  async logSkill(
    userId: string,
    connectionId: string,
    dto: { skillName: string; notes?: string; sessionId?: string },
  ) {
    const connection = await this.prisma.mentorConnection.findUnique({ where: { id: connectionId } });
    if (!connection) throw new NotFoundException('Connection not found');
    if (connection.userId !== userId) throw new ForbiddenException('Not your mentorship connection');

    const skillName = await this.normalizeSkillName(userId, dto.skillName.trim());

    return this.prisma.skillLog.create({
      data: {
        connectionId,
        sessionId: dto.sessionId,
        menteeId: userId,
        skillName,
        notes: dto.notes,
      },
    });
  }

  /** Resolves free-text input to a canonical skill name from the mentee's
   *  active career path, if one is close enough. Cheap string matching
   *  first; only falls back to an AI call for genuinely ambiguous cases
   *  (different wording, same skill) — and even then, only if the input
   *  doesn't already exactly match something. */
  private async normalizeSkillName(userId: string, rawSkillName: string): Promise<string> {
    const goal = await this.prisma.menteeCareerGoal.findUnique({
      where: { menteeId: userId },
      include: { careerPath: { include: { requiredSkills: true } } },
    });
    const candidates = goal?.careerPath.requiredSkills.map((s) => s.skillName) ?? [];
    if (candidates.length === 0) return rawSkillName;

    const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const rawSimplified = simplify(rawSkillName);

    // Exact match (case/punctuation-insensitive) — no AI needed.
    const exact = candidates.find((c) => simplify(c) === rawSimplified);
    if (exact) return exact;

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return rawSkillName;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.GROQ_EXTRACTION_MODEL || 'openai/gpt-oss-120b',
          messages: [
            {
              role: 'system',
              content: `You match a free-text skill name to a canonical list, or say it doesn't match. Respond with ONLY valid JSON, no markdown fences: {"match": string | null} — the exact string from the candidate list if it clearly refers to the same skill, otherwise null. Be conservative: only match if you're confident it's the same skill under different wording.`,
            },
            {
              role: 'user',
              content: `Free-text skill: "${rawSkillName}"\nCandidates: ${JSON.stringify(candidates)}`,
            },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) return rawSkillName;
      const payload = await response.json();
      const parsed = JSON.parse(payload?.choices?.[0]?.message?.content ?? '{}');
      return typeof parsed.match === 'string' && candidates.includes(parsed.match) ? parsed.match : rawSkillName;
    } catch {
      return rawSkillName; // normalization is advisory — never block on it
    }
  }

  /** All skills logged within one connection — visible to either party. */
  async listSkillLogs(userId: string, connectionId: string) {
    await this.assertConnectionMember(connectionId, userId);
    return this.prisma.skillLog.findMany({
      where: { connectionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Mentor taps to confirm a mentee's self-reported skill actually happened. */
  async confirmSkillLog(userId: string, skillLogId: string) {
    const log = await this.prisma.skillLog.findUnique({
      where: { id: skillLogId },
      include: { connection: { include: { mentor: true } } },
    });
    if (!log) throw new NotFoundException('Skill log not found');
    if (log.connection.mentor.userId !== userId) {
      throw new ForbiddenException('Only the mentor on this connection can confirm this');
    }

    return this.prisma.skillLog.update({
      where: { id: skillLogId },
      data: { confirmedByMentor: true },
    });
  }

  // ───────────────────────── Admin: mentor directory management ─────────────────────────

  async createMentor(dto: CreateMentorDto) {
    const mentor = await this.prisma.mentor.create({
      data: {
        name: dto.name,
        role: dto.role,
        company: dto.company,
        avatarUrl: dto.avatarUrl,
        bio: dto.bio,
        skills: dto.skills ?? [],
        isActive: dto.isActive ?? true,
        category: dto.category?.trim() || 'General',
        schools: dto.schools ?? [],
      },
    });
    this.realtime.broadcast('mentors:updated');
    return mentor;
  }

  async updateMentor(id: string, dto: UpdateMentorDto) {
    const mentor = await this.prisma.mentor.findUnique({ where: { id } });
    if (!mentor) throw new NotFoundException('Mentor not found');

    const updated = await this.prisma.mentor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.company !== undefined && { company: dto.company }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.skills !== undefined && { skills: dto.skills }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.category !== undefined && { category: dto.category.trim() || 'General' }),
        ...(dto.schools !== undefined && { schools: dto.schools }),
      },
    });
    this.realtime.broadcast('mentors:updated');
    return updated;
  }

  /** Soft-delete: keeps existing MentorConnection history intact and just
   *  drops the mentor out of findAll()'s isActive:true filter. */
  async removeMentor(id: string) {
    const mentor = await this.prisma.mentor.findUnique({ where: { id } });
    if (!mentor) throw new NotFoundException('Mentor not found');
    const updated = await this.prisma.mentor.update({ where: { id }, data: { isActive: false } });
    this.realtime.broadcast('mentors:updated');
    return updated;
  }

  // ───────────────────────── Admin: promote/demote a real user to mentor ─────────────────────────

  /** Admin picks an EXISTING user — they keep their own email/password login.
   *  This sets User.role = MENTOR and creates (or re-links) their Mentor
   *  profile row so they can log in and see "My Mentees". */
  async promoteToMentor(dto: PromoteMentorDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    const existingProfile = await this.prisma.mentor.findUnique({ where: { userId: dto.userId } });

    const [, mentor] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: dto.userId }, data: { role: UserRole.MENTOR } }),
      existingProfile
        ? this.prisma.mentor.update({
            where: { userId: dto.userId },
            data: {
              role: dto.roleTitle,
              company: dto.company,
              avatarUrl: dto.avatarUrl,
              bio: dto.bio,
              skills: dto.skills ?? existingProfile.skills,
              isActive: true,
            },
          })
        : this.prisma.mentor.create({
            data: {
              userId: dto.userId,
              name: `${user.firstname} ${user.lastname}`.trim(),
              role: dto.roleTitle,
              company: dto.company,
              avatarUrl: dto.avatarUrl,
              bio: dto.bio,
              skills: dto.skills ?? [],
              isActive: true,
            },
          }),
    ]);

    this.realtime.broadcast('mentors:updated');
    this.realtime.emitToUser(dto.userId, 'mentors:updated');
    return mentor;
  }

  /** Admin revokes mentor status: role reverts, profile is deactivated (not
   *  deleted) so existing connection/session history stays intact. */
  async demoteMentor(userId: string) {
    const mentor = await this.prisma.mentor.findUnique({ where: { userId } });
    if (!mentor) throw new NotFoundException('This user has no mentor profile');

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { role: UserRole.STUDENT } }),
      this.prisma.mentor.update({ where: { userId }, data: { isActive: false } }),
    ]);

    this.realtime.broadcast('mentors:updated');
    this.realtime.emitToUser(userId, 'mentors:updated');
    return { message: 'Mentor status revoked' };
  }

  // ───────────────────────── Mentor's own view: "My Mentees" ─────────────────────────

  private async getMentorProfileOrThrow(userId: string) {
    const mentor = await this.prisma.mentor.findUnique({ where: { userId } });
    if (!mentor) throw new ForbiddenException('This account has no mentor profile');
    return mentor;
  }

  async findMyMentees(userId: string) {
    const mentor = await this.getMentorProfileOrThrow(userId);

    const connections = await this.prisma.mentorConnection.findMany({
      where: { mentorId: mentor.id },
      include: {
        user: {
          select: { id: true, firstname: true, lastname: true, email: true, organization: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return connections.map((c) => ({
      connectionId: c.id,
      status: c.status,
      sessionsCompleted: c.sessionsCompleted,
      nextSessionAt: c.nextSessionAt,
      updatedAt: c.updatedAt,
      mentee: c.user,
    }));
  }

  /** Mentor accepts/declines a pending request, logs a session, or schedules the next one. */
  async updateMenteeConnection(userId: string, connectionId: string, dto: UpdateMenteeConnectionDto) {
    const mentor = await this.getMentorProfileOrThrow(userId);

    const connection = await this.prisma.mentorConnection.findUnique({ where: { id: connectionId } });
    if (!connection || connection.mentorId !== mentor.id) {
      throw new NotFoundException('Mentee connection not found');
    }

    const updated = await this.prisma.mentorConnection.update({
      where: { id: connectionId },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.sessionsCompleted !== undefined && { sessionsCompleted: dto.sessionsCompleted }),
        ...(dto.nextSessionAt !== undefined && { nextSessionAt: new Date(dto.nextSessionAt) }),
      },
      include: { user: { select: { id: true, firstname: true, lastname: true, email: true } } },
    });

    if (dto.status === MentorConnectionStatus.ACTIVE && connection.status !== MentorConnectionStatus.ACTIVE) {
      await this.badgesService.evaluate(updated.userId, 'MENTOR_CONNECTIONS');
    }

    // Mentee's "My Mentors" status/next-session card and the mentor's own
    // "My Mentees" row both changed — push to both sides of the connection.
    this.realtime.emitToUser(updated.userId, 'mentors:updated');
    this.realtime.emitToUser(userId, 'mentors:updated');

    return updated;
  }

  // ───────────────────────── Mentor <-> mentee direct messaging ─────────────────────────

  /** Confirms `userId` is either side of the connection before touching messages. */
  private async assertConnectionMember(connectionId: string, userId: string) {
    const connection = await this.prisma.mentorConnection.findUnique({
      where: { id: connectionId },
      include: { mentor: true },
    });
    if (!connection) throw new NotFoundException('Connection not found');

    const isMentee = connection.userId === userId;
    const isMentor = connection.mentor.userId === userId;
    if (!isMentee && !isMentor) throw new ForbiddenException('Not part of this connection');

    return connection;
  }

  async getMessages(connectionId: string, userId: string) {
    await this.assertConnectionMember(connectionId, userId);
    return this.prisma.menteeMessage.findMany({
      where: { connectionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(connectionId: string, userId: string, content: string) {
    await this.assertConnectionMember(connectionId, userId);
    const message = await this.prisma.menteeMessage.create({
      data: { connectionId, senderId: userId, content },
    });
    // Instant push to whoever has this thread open (see RealtimeGateway
    // 'chat:join'/'chat:room' on the frontend). The chat:join handshake
    // already verifies the recipient is one of the two people on this
    // connection, so nothing extra to check here.
    this.realtime.emitToRoom(`chat:${connectionId}`, 'chat:message', message);
    return message;
  }

  // ───────────────────────── Sessions ─────────────────────────
  // Flow: mentee proposes a time (PENDING) -> mentor confirms, possibly
  // adjusting the time (SCHEDULED) -> either party marks the outcome
  // afterward (COMPLETED / NO_SHOW / CANCELLED). Completed sessions are the
  // source of truth for "Total Sessions" and are the natural moment to log a
  // skill (see SkillLog.sessionId).

  async listSessions(connectionId: string, userId: string) {
    await this.assertConnectionMember(connectionId, userId);
    return this.prisma.mentorSession.findMany({
      where: { connectionId },
      orderBy: { proposedFor: 'desc' },
    });
  }

  /** Mentee proposes a session time within a connection they belong to. */
  async requestSession(
    connectionId: string,
    userId: string,
    dto: { proposedFor: string; durationMins?: number; agenda?: string },
  ) {
    const connection = await this.assertConnectionMember(connectionId, userId);
    if (connection.userId !== userId) {
      throw new ForbiddenException('Only the mentee can propose a session time');
    }

    return this.prisma.mentorSession.create({
      data: {
        connectionId,
        proposedFor: new Date(dto.proposedFor),
        durationMins: dto.durationMins,
        agenda: dto.agenda,
      },
    });
  }

  /** Either party can update a session: mentor confirming/declining a time,
   *  either side marking it completed/no-show/cancelled, or adding notes. */
  async updateSession(
    sessionId: string,
    userId: string,
    dto: {
      status?: string;
      scheduledFor?: string;
      mentorNotes?: string;
      menteeNotes?: string;
    },
  ) {
    const session = await this.prisma.mentorSession.findUnique({
      where: { id: sessionId },
      include: { connection: { include: { mentor: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');

    const isMentee = session.connection.userId === userId;
    const isMentor = session.connection.mentor.userId === userId;
    if (!isMentee && !isMentor) throw new ForbiddenException('Not part of this connection');

    // Only the mentor can confirm a time / move a PENDING request to SCHEDULED —
    // mentees propose, mentors confirm. Either side can mark an already-scheduled
    // session's outcome (completed/no-show/cancelled).
    if (dto.status === 'SCHEDULED' && !isMentor) {
      throw new ForbiddenException('Only the mentor can confirm a session time');
    }

    const updated = await this.prisma.mentorSession.update({
      where: { id: sessionId },
      data: {
        status: dto.status as any,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
        mentorNotes: isMentor ? dto.mentorNotes : undefined,
        menteeNotes: isMentee ? dto.menteeNotes : undefined,
      },
    });

    // Keep the legacy sessionsCompleted counter roughly in sync for anything
    // still reading it directly, even though stats() no longer trusts it.
    if (dto.status === 'COMPLETED') {
      const completedCount = await this.prisma.mentorSession.count({
        where: { connectionId: session.connectionId, status: 'COMPLETED' },
      });
      await this.prisma.mentorConnection.update({
        where: { id: session.connectionId },
        data: { sessionsCompleted: completedCount },
      });
    }

    return updated;
  }

  // ───────────────────────── Mentor Spotlight (admin-curated) ─────────────────────────

  /** Public: the current shoutout(s) to show on the dashboard/homepage. */
  async getActiveSpotlights() {
    const now = new Date();
    return this.prisma.mentorSpotlight.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: { mentor: true },
      orderBy: { startDate: 'desc' },
    });
  }

  async adminListSpotlights() {
    return this.prisma.mentorSpotlight.findMany({
      include: { mentor: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSpotlight(dto: CreateMentorSpotlightDto) {
    const mentor = await this.prisma.mentor.findUnique({ where: { id: dto.mentorId } });
    if (!mentor) throw new NotFoundException('Mentor not found');

    const spotlight = await this.prisma.mentorSpotlight.create({
      data: {
        mentorId: dto.mentorId,
        shoutout: dto.shoutout,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { mentor: true },
    });
    this.realtime.broadcast('mentors:updated');
    return spotlight;
  }

  async updateSpotlight(id: string, dto: UpdateMentorSpotlightDto) {
    const spotlight = await this.prisma.mentorSpotlight.findUnique({ where: { id } });
    if (!spotlight) throw new NotFoundException('Spotlight not found');

    const updated = await this.prisma.mentorSpotlight.update({
      where: { id },
      data: {
        shoutout: dto.shoutout,
        isActive: dto.isActive,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { mentor: true },
    });
    this.realtime.broadcast('mentors:updated');
    return updated;
  }

  async removeSpotlight(id: string) {
    const spotlight = await this.prisma.mentorSpotlight.findUnique({ where: { id } });
    if (!spotlight) throw new NotFoundException('Spotlight not found');
    await this.prisma.mentorSpotlight.delete({ where: { id } });
    this.realtime.broadcast('mentors:updated');
    return { message: 'Spotlight removed' };
  }
}
