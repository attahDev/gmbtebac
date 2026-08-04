import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConcernService } from './concern.service';
import { CreateConcernDto } from './dto/create-concern.dto';
import { ConcernStatus, UserRole } from '@prisma/client';
import { OptionalJwtAuthGuard } from 'src/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';

@Controller('concerns')
export class ConcernController {
  constructor(private readonly concernService: ConcernService) {}

  // Optional auth so anonymous visitors can report a concern too (e.g. about
  // an AI recommendation shown before they logged in) — same pattern as the
  // chatbot's message endpoint.
  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60 } })
  create(@Req() req: any, @Body() dto: CreateConcernDto) {
    return this.concernService.create(req.user?.userId ?? null, dto);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(@Query('limit') limit?: string, @Query('status') status?: ConcernStatus) {
    const take = limit ? Math.min(parseInt(limit, 10) || 50, 100) : 50;
    return this.concernService.findAll(take, status);
  }

  @Patch('admin/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateStatus(@Param('id') id: string, @Body('status') status: ConcernStatus) {
    return this.concernService.updateStatus(id, status);
  }
}
