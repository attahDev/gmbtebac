import { Test, TestingModule } from '@nestjs/testing';
import { BusinessPlannerService } from './business-planner.service';

describe('BusinessPlannerService', () => {
  let service: BusinessPlannerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BusinessPlannerService],
    }).compile();

    service = module.get<BusinessPlannerService>(BusinessPlannerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
