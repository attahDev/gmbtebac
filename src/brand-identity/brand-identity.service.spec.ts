import { Test, TestingModule } from '@nestjs/testing';
import { BrandIdentityService } from './brand-identity.service';

describe('BrandIdentityService', () => {
  let service: BrandIdentityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BrandIdentityService],
    }).compile();

    service = module.get<BrandIdentityService>(BrandIdentityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
