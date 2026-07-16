import { Module } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  providers: [RefreshTokenService],
  imports: [PrismaModule, JwtModule],
  exports: [RefreshTokenService],
})
export class RefreshTokenModule {}
