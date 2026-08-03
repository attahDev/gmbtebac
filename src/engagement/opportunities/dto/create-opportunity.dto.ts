import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOpportunityDto {
  @ApiProperty({ example: 'Junior Backend Developer' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'GMBTE Partner Co.' })
  @IsString()
  @IsNotEmpty()
  company: string;

  @ApiPropertyOptional({ example: 'Manchester, UK' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Jobs' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Full-time' })
  @IsOptional()
  @IsString()
  type?: string;

  // Restricts this opportunity to holders of a specific School's
  // certification (e.g. "aws"). Omit for open-to-everyone.
  @ApiPropertyOptional({ example: 'aws' })
  @IsOptional()
  @IsString()
  requiredSchool?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  // Where the "Apply" button sends the user — required for manual entries
  // since there's nothing else to route them to.
  @ApiProperty({ example: 'https://apply.example.com/job/123' })
  @IsUrl({ require_protocol: true })
  applyUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}
