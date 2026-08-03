import { IsArray, IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { EventAudience } from '@prisma/client';

export class CreateEventDto {
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
  imageUrl?: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  link?: string;

  // Admin pastes an existing partner-hosted Eventbrite event's URL or raw
  // ID — extracted server-side via EventbriteService.extractEventId. Only
  // set this OR publishToEventbrite, not both — a GMBTE event is either
  // linked to someone else's existing Eventbrite listing, or dual-listed
  // as a brand-new one under GMBTE's own organizer account, never both.
  @IsOptional()
  @IsString()
  eventbriteUrl?: string;

  // When true, EventsService also publishes this event under GMBTE's own
  // Eventbrite organizer account right after creating it locally, and
  // stores the returned event ID/URL back onto the row. No-ops (logged,
  // non-fatal) if GMBTE has no Eventbrite organizer credentials set.
  @IsOptional()
  @IsBoolean()
  publishToEventbrite?: boolean;

  @IsDateString()
  startsAt: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  // Which public Events page this shows on — gmbtefro (GENERAL, default)
  // or the Hall of Fame site (HALL_OF_FAME). See schema comment on
  // Event.audience.
  @IsOptional()
  @IsEnum(EventAudience)
  audience?: EventAudience;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
