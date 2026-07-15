import { Test, TestingModule } from '@nestjs/testing';
import { BusinessPlannerController } from './business-planner.controller';

describe('BusinessPlannerController', () => {
  let controller: BusinessPlannerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BusinessPlannerController],
    }).compile();

    controller = module.get<BusinessPlannerController>(BusinessPlannerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
