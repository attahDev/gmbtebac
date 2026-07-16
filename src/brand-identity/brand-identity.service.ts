/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

@Injectable()
export class BrandIdentityService {
  private readonly logger = new Logger(BrandIdentityService.name);

  private readonly BASE_URL =
    process.env.BRAND_IDENTITY_API_URL ||
    'https://brand-identity.onrender.com';

  constructor(private readonly httpService: HttpService) {}

  async generateAsset(assetType: string, payload: any) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.BASE_URL}/assets/generate/${assetType}`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 60000,
          },
        ),
      );

      return {
        success: true,
        message: 'Brand asset generation started successfully',
        data: response.data,
      };
    } catch (error) {
      this.handleError(error, 'Could not generate brand asset');
    }
  }

  async getAssetStatus(assetId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.BASE_URL}/assets/${assetId}/status`, {
          timeout: 30000,
        }),
      );

      return {
        success: true,
        message: 'Asset status fetched successfully',
        data: response.data,
      };
    } catch (error) {
      this.handleError(error, 'Could not fetch asset status');
    }
  }

  async getAssetExport(assetId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.BASE_URL}/assets/${assetId}/export`, {
          timeout: 30000,
        }),
      );

      return {
        success: true,
        message: 'Asset export fetched successfully',
        data: response.data,
      };
    } catch (error) {
      this.handleError(error, 'Could not fetch asset export');
    }
  }

  async listAssets(assetType?: string, limit?: string, offset?: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.BASE_URL}/assets`, {
          params: {
            asset_type: assetType,
            limit,
            offset,
          },
          timeout: 30000,
        }),
      );

      return {
        success: true,
        message: 'Assets fetched successfully',
        data: response.data,
      };
    } catch (error) {
      this.handleError(error, 'Could not fetch assets');
    }
  }

  async getAssetDetail(assetId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.BASE_URL}/assets/${assetId}`, {
          timeout: 30000,
        }),
      );

      return {
        success: true,
        message: 'Asset detail fetched successfully',
        data: response.data,
      };
    } catch (error) {
      this.handleError(error, 'Could not fetch asset detail');
    }
  }

  async getEditPrefill(assetId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.BASE_URL}/assets/${assetId}/edit`, {
          timeout: 30000,
        }),
      );

      return {
        success: true,
        message: 'Asset edit prefill fetched successfully',
        data: response.data,
      };
    } catch (error) {
      this.handleError(error, 'Could not fetch asset edit prefill');
    }
  }

  async regenerateAsset(assetId: string, payload: any) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.BASE_URL}/assets/${assetId}/regenerate`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 60000,
          },
        ),
      );

      return {
        success: true,
        message: 'Brand asset regeneration started successfully',
        data: response.data,
      };
    } catch (error) {
      this.handleError(error, 'Could not regenerate brand asset');
    }
  }

  async healthCheck() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.BASE_URL}/health`, {
          timeout: 10000,
        }),
      );

      return {
        success: true,
        message: 'Brand Identity API is reachable',
        data: response.data,
      };
    } catch (error) {
      this.handleError(error, 'Brand Identity API is not reachable');
    }
  }

  private handleError(error: unknown, fallbackMessage: string): never {
    if (error instanceof AxiosError) {
      this.logger.error(error.message, error.stack);

      const status = error.response?.status;
      const detail =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.response?.data?.error ||
        fallbackMessage;

      if (status === 404) {
        throw new NotFoundException(detail);
      }

      throw new BadRequestException(detail);
    }

    throw new BadRequestException(fallbackMessage);
  }
}
