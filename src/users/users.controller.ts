import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Patch,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
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
  updateProfile(
    @CurrentUser() user: any,
    @Body() updateData: { name: string },
  ) {
    return this.usersService.updateProfile(user.userId, updateData);
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
}
