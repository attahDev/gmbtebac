import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UseCase } from '@prisma/client';

@Injectable()
export class OtpService {
  constructor(private prisma: PrismaService) {}

  generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createOtp(
    userId: string,
    useCase: UseCase,
    expiresInMinutes: number = 10,
  ) {
    const code = this.generateOtpCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

    // Delete any existing OTPs for the same user and use case
    await this.prisma.otp.deleteMany({
      where: {
        userId,
        useCase,
      },
    });

    return this.prisma.otp.create({
      data: {
        code,
        userId,
        useCase,
        expiresAt,
      },
    });
  }

  async verifyOtp(userId: string, code: string, useCase: UseCase) {
    const otp = await this.prisma.otp.findFirst({
      where: {
        userId,
        code,
        useCase,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!otp) {
      return false;
    }

    // Delete the OTP after verification (one-time use)
    await this.prisma.otp.delete({
      where: { id: otp.id },
    });

    return true;
  }

  async isValidOtp(userId: string, code: string, useCase: UseCase) {
    const otp = await this.prisma.otp.findFirst({
      where: {
        userId,
        code,
        useCase,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    return !!otp;
  }
}
