import { Test, TestingModule } from '@nestjs/testing';
import { BrandIdentityController } from './brand-identity.controller';

describe('BrandIdentityController', () => {
  let controller: BrandIdentityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandIdentityController],
    }).compile();

    controller = module.get<BrandIdentityController>(BrandIdentityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
