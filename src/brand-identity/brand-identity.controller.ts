/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BrandIdentityService } from './brand-identity.service';

@Controller('brand-identity')
export class BrandIdentityController {
  constructor(private readonly brandIdentityService: BrandIdentityService) {}

  @Post('assets/generate/:assetType')
  generateAsset(@Param('assetType') assetType: string, @Body() body: any) {
    return this.brandIdentityService.generateAsset(assetType, body);
  }

  @Get('assets/:assetId/status')
  getAssetStatus(@Param('assetId') assetId: string) {
    return this.brandIdentityService.getAssetStatus(assetId);
  }

  @Get('assets/:assetId/export')
  getAssetExport(@Param('assetId') assetId: string) {
    return this.brandIdentityService.getAssetExport(assetId);
  }

  @Get('assets')
  listAssets(
    @Query('asset_type') assetType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.brandIdentityService.listAssets(assetType, limit, offset);
  }

  @Get('assets/:assetId')
  getAssetDetail(@Param('assetId') assetId: string) {
    return this.brandIdentityService.getAssetDetail(assetId);
  }

  @Get('assets/:assetId/edit')
  getEditPrefill(@Param('assetId') assetId: string) {
    return this.brandIdentityService.getEditPrefill(assetId);
  }

  @Post('assets/:assetId/regenerate')
  regenerateAsset(@Param('assetId') assetId: string, @Body() body: any) {
    return this.brandIdentityService.regenerateAsset(assetId, body);
  }

  @Get('health')
  healthCheck() {
    return this.brandIdentityService.healthCheck();
  }
}