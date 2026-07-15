import { Test, TestingModule } from '@nestjs/testing';
import { MentorAiController } from './mentor-ai.controller';

describe('MentorAiController', () => {
  let controller: MentorAiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MentorAiController],
    }).compile();

    controller = module.get<MentorAiController>(MentorAiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
