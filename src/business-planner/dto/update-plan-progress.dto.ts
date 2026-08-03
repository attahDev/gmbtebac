import { IsArray, IsInt } from 'class-validator';

export class UpdatePlanProgressDto {
  // Full set of currently-checked action indexes, sent as one array so a
  // single request always fully replaces state (avoids race conditions from
  // rapid checkbox clicks sending overlapping partial updates).
  @IsArray()
  @IsInt({ each: true })
  completedActionIndexes: number[];
}
