import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { UserRole, ProfileVisibility } from '@prisma/client';

const ADMIN_SAFE_SELECT = {
  id: true,
  email: true,
  firstname: true,
  lastname: true,
  organization: true,
  role: true,
  isVerified: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PROFILE_SELECT = {
  id: true,
  email: true,
  firstname: true,
  lastname: true,
  organization: true,
  role: true,
  region: true,
  profileVisibility: true,
  isVerified: true,
  createdAt: true, // "Member since"
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: ADMIN_SAFE_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // Only one refresh token is ever active per user (see RefreshTokenService —
  // logging in revokes prior tokens), so "session" here means that single
  // active token, not a multi-device list. If multi-device tracking is added
  // later, this should switch to returning all non-revoked tokens for the user.
  async getActiveSession(userId: string) {
    const session = await this.prisma.refreshToken.findFirst({
      where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, expiresAt: true },
    });
    return {
      active: !!session,
      startedAt: session?.createdAt ?? null,
      expiresAt: session?.expiresAt ?? null,
    };
  }

  async updateProfile(
    userId: string,
    data: { firstname?: string; lastname?: string; organization?: string; region?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: PROFILE_SELECT,
    });
  }

  /** Privacy & account settings — currently just profile visibility.
   *  No 2FA field yet — deliberately not added until that's built. */
  async updateSettings(userId: string, data: { profileVisibility?: ProfileVisibility }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: PROFILE_SELECT,
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return { message: 'Password changed successfully' };
  }

  // ───────────────────────── Admin: user management ─────────────────────────

  async findAllAdmin(search?: string) {
    return this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { firstname: { contains: search, mode: 'insensitive' } },
              { lastname: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: ADMIN_SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByIdAdmin(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: ADMIN_SAFE_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** ADMIN is deliberately excluded — granting admin access must stay a
   *  direct DB/Prisma Studio action, never something reachable through the
   *  API (and therefore never something a compromised admin session could
   *  do to escalate itself or anyone else). */
  async updateRole(id: string, role: UserRole) {
    if (role === UserRole.ADMIN) {
      throw new BadRequestException('Admin access cannot be granted through the app — this is a direct database action only.');
    }
    if (role === UserRole.MENTOR) {
      throw new BadRequestException('Use POST /mentors/promote to make someone a mentor — it sets up their mentor profile at the same time.');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: ADMIN_SAFE_SELECT,
    });
  }

  /** Immediate effect — JwtStrategy checks isActive on every request, so a
   *  deactivated user's existing token stops working right away. */
  async setActive(id: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: ADMIN_SAFE_SELECT,
    });
  }
}
