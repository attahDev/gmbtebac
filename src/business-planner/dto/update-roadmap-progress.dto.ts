import { IsArray, IsString } from 'class-validator';

export class UpdateRoadmapProgressDto {
  // Full set of currently-checked roadmap items, keyed as
  // "<phaseIndex>-<itemIndex>" (e.g. "0-2"). Sent as one array so a single
  // request always fully replaces state (avoids race conditions from rapid
  // checkbox clicks sending overlapping partial updates).
  @IsArray()
  @IsString({ each: true })
  completedRoadmapItems: string[];
}
