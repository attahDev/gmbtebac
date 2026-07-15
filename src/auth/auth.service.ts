/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { UseCase } from '@prisma/client';
import { RefreshTokenService } from 'src/refresh-token/refresh-token.service';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private otpService: OtpService,
    private mailService: MailService,
    private refreshTokenService: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Create user
    const user: User = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstname: dto.firstname,
        lastname: dto.lastname,
        organization: dto.organization,
        role: dto.role,

        password: hashedPassword,
        agreedToTerms: dto.agreedToTerms,
        isVerified: false,
      },
    });

    // Generate OTP for email verification
    const otp = await this.otpService.createOtp(
      user.id,
      UseCase.EMAIL_VERIFICATION,
    );

    // Send verification email
    await this.mailService.sendVerificationEmail(
      user.email,
      user.firstname,
      otp.code,
    );

    const verificationPayload = {
      email: user.email,
      sub: user.id,
      purpose: 'email_verification',
    };

    const verificationToken = this.jwtService.sign(verificationPayload, {
      expiresIn: '10m', // Short-lived token
      secret: process.env.JWT_VERIFICATION_SECRET || process.env.JWT_SECRET,
    });

    // Return user without password
    const { password, ...result } = user;
    return {
      message:
        'Registration successful. Please check your email for verification code.',
      user: result,
      verification_token: verificationToken,
    };
  }

  async login(dto: LoginDto) {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if email is verified
    if (!user.isVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in',
      );
    }

    // Generate JWT token
    // const payload = { email: user.email, sub: user.id };
    // const accessToken = this.jwtService.sign(payload);
    const tokens = await this.generateTokens(user);

    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.firstname,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }

  private async generateTokens(user: any) {
    const payload = { email: user.email, sub: user.id };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = await this.refreshTokenService.createRefreshToken(
      user.id,
    );

    return {
      accessToken,
      refreshToken: refreshToken.token,
    };
  }

  async refreshTokens(refreshToken: string) {
    const user =
      await this.refreshTokenService.validateRefreshToken(refreshToken);

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user);

    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Verify OTP
    const isValidOtp = await this.otpService.verifyOtp(
      user.id,
      dto.otpCode,
      UseCase.EMAIL_VERIFICATION,
    );

    if (!isValidOtp) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Update user verification status
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true },
    });

    return { message: 'Email verified successfully' };
  }

  async verifyEmailWithToken(dto: VerifyEmailDto, verificationToken: string) {
    try {
      // Verify the temporary token
      const decoded = this.jwtService.verify(verificationToken, {
        secret: process.env.JWT_VERIFICATION_SECRET || process.env.JWT_SECRET,
      });

      // Ensure token is for email verification
      if (decoded.purpose !== 'email_verification') {
        throw new UnauthorizedException('Invalid verification token');
      }

      // Ensure the email in token matches the email in request
      if (decoded.email !== dto.email) {
        throw new UnauthorizedException('Email mismatch');
      }

      // Find user by ID from token (more secure than email)
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Verify OTP for this specific user
      const isValidOtp = await this.otpService.verifyOtp(
        user.id,
        dto.otpCode,
        UseCase.EMAIL_VERIFICATION,
      );

      if (!isValidOtp) {
        throw new BadRequestException('Invalid or expired OTP code');
      }

      // Update user verification status
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true },
      });

      // Generate proper access token for login
      const loginPayload = { email: user.email, sub: user.id };
      const accessToken = this.jwtService.sign(loginPayload);

      return {
        message: 'Email verified successfully',
        access_token: accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.firstname,
          role: user.role,
          isVerified: true,
        },
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException(
          'Verification session expired. Please register again.',
        );
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid verification token');
      }
      throw error;
    }
  }

  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generate new OTP
    const otp = await this.otpService.createOtp(
      user.id,
      UseCase.EMAIL_VERIFICATION,
    );

    // Send verification email
    await this.mailService.sendVerificationEmail(
      user.email,
      user.firstname,
      otp.code,
    );

    return { message: 'Verification email sent successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // For security, don't reveal if user exists or not
    if (!user) {
      return {
        message:
          'If an account with that email exists, a password reset OTP has been sent.',
      };
    }

    // Generate OTP for password reset
    const otp = await this.otpService.createOtp(
      user.id,
      UseCase.PASSWORD_RESET,
    );

    // Send password reset email
    await this.mailService.sendPasswordResetEmail(
      user.email,
      user.firstname,
      otp.code,
    );

    return {
      message:
        'If an account with that email exists, a password reset OTP has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify OTP
    const isValidOtp = await this.otpService.verifyOtp(
      user.id,
      dto.otpCode,
      UseCase.PASSWORD_RESET,
    );

    if (!isValidOtp) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    // Update user password
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return { message: 'Password reset successfully' };
  }

  async logout(refreshToken: string) {
    await this.refreshTokenService.revokeRefreshToken(refreshToken);
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string) {
    await this.refreshTokenService.revokeAllUserRefreshTokens(userId);
    return { message: 'Logged out from all devices successfully' };
  }
}
