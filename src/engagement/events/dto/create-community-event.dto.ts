import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** What a member can submit via "Host an Event". Deliberately excludes
 *  isActive/isFeatured/isCompleted — those stay admin-only controls, even
 *  after approval. Submissions always land as PENDING (see
 *  EventsService.submitCommunityEvent). No imageUrl field: the photo comes
 *  through as a multipart file (see events.controller.ts), not a raw URL —
 *  keeps this endpoint from becoming an open image-hosting proxy. */
export class CreateCommunityEventDto {
  @IsString()
  @IsNotEmpty()
  title: string;

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

  // Same as CreateEventDto.eventbriteUrl — a member hosting their own
  // event on Eventbrite can link it here. No publishToEventbrite option
  // for community submissions: auto-publishing under GMBTE's own
  // Eventbrite organizer account stays admin-only.
  @IsOptional()
  @IsString()
  eventbriteUrl?: string;

  @IsDateString()
  startsAt: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
