import { Test, TestingModule } from '@nestjs/testing';
import { MentorAiService } from './mentor-ai.service';

describe('MentorAiService', () => {
  let service: MentorAiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MentorAiService],
    }).compile();

    service = module.get<MentorAiService>(MentorAiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
