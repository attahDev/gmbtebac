import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BrandIdentityController } from './brand-identity.controller';
import { BrandIdentityService } from './brand-identity.service';

@Module({
  imports: [HttpModule],
  controllers: [BrandIdentityController],
  providers: [BrandIdentityService],
  exports: [BrandIdentityService],
})
export class BrandIdentityModule {}