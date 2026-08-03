import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

/** What a member can change on their own submission via "My Events" →
 *  Hosting → Edit. Same field set as CreateCommunityEventDto (title
 *  excepted, still required there) but every field optional here since
 *  this is a partial update. Still excludes isActive/isFeatured/source —
 *  those stay admin-only even for the event's own creator (see
 *  EventsService.updateMySubmission for the ownership + re-review logic). */
export class UpdateCommunityEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsString()
  eventbriteUrl?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
