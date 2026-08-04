import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Patch,
  Param,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { CurrentUser } from 'src/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true }))
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.userId);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: any, @Body() updateData: UpdateProfileDto) {
    return this.usersService.updateProfile(user.userId, updateData);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: any, @Body() updateData: UpdateSettingsDto) {
    return this.usersService.updateSettings(user.userId, updateData);
  }

  @Get('session')
  getActiveSession(@CurrentUser() user: any) {
    return this.usersService.getActiveSession(user.userId);
  }

  @Put('change-password')
  changePassword(
    @CurrentUser() user: any,
    @Body()
    changePasswordData: { currentPassword: string; newPassword: string },
  ) {
    return this.usersService.changePassword(
      user.userId,
      changePasswordData.currentPassword,
      changePasswordData.newPassword,
    );
  }

  // ───────────────────────── Admin: user management ─────────────────────────

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(@Query('search') search?: string) {
    return this.usersService.findAllAdmin(search);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findByIdAdmin(id);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.usersService.updateRole(id, role);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateStatus(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.usersService.setActive(id, isActive);
  }
}
