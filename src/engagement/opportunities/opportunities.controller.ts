import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesSyncService } from './opportunities-sync.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

@ApiTags('opportunities')
@ApiBearerAuth('access-token')
@Controller('opportunities')
@UseGuards(JwtAuthGuard)
export class OpportunitiesController {
  constructor(
    private opportunitiesService: OpportunitiesService,
    private syncService: OpportunitiesSyncService,
  ) {}

  /** Powers the Opportunities page. ?search= matches title/company/description,
   *  ?category= filters to one category (e.g. "Jobs", "Grants", "Internships").
   *  Featured rows (manual or API) are always pinned first — same pattern as
   *  featured Events/Courses. ?includeInactive=true — used by the admin
   *  table, so a removed opportunity is still visible (and restorable)
   *  instead of just vanishing. */
  /** Powers the Opportunities page. ?search= matches title/company/description,
   *  ?category= filters to one category (e.g. "Jobs", "Grants", "Internships").
   *  ?school= filters to opportunities requiring a specific Academy School's
   *  certification. ?eligibleOnly=true additionally drops any requiredSchool
   *  row the caller hasn't earned a Certificate for (rows with no
   *  requiredSchool always show). Featured rows (manual or API) are always
   *  pinned first — same pattern as featured Events/Courses.
   *  ?includeInactive=true — used by the admin table, so a removed
   *  opportunity is still visible (and restorable) instead of just
   *  vanishing. */
  @Get()
  @ApiOperation({ summary: 'Search and filter opportunities' })
  @ApiQuery({ name: 'search', required: false, description: 'Matches title/company/description' })
  @ApiQuery({ name: 'category', required: false, example: 'Jobs' })
  @ApiQuery({ name: 'school', required: false, description: 'Filter by required Academy School, e.g. "aws"' })
  @ApiQuery({ name: 'eligibleOnly', required: false, description: 'Only show rows the caller is certified for' })
  @ApiQuery({ name: 'includeInactive', required: false, description: 'Admin table: include removed rows' })
  findAll(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('school') school?: string,
    @Query('eligibleOnly') eligibleOnly?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.opportunitiesService.findAll({
      search,
      category,
      school,
      includeInactive: includeInactive === 'true',
      eligibleOnly: eligibleOnly === 'true',
      userId: user?.userId,
    });
  }

  /** Distinct requiredSchool list, for a "By Certification" filter dropdown —
   *  same derive-from-data pattern as findCategories. */
  @Get('schools')
  @ApiOperation({ summary: 'List distinct required Schools for filter chips/dropdown' })
  findSchools() {
    return this.opportunitiesService.findSchools();
  }

  /** Distinct category list, for the filter chips/dropdown — derived from
   *  whatever admins/sync have actually populated rather than a hardcoded
   *  enum, so a new category just works. */
  @Get('categories')
  @ApiOperation({ summary: 'List distinct categories for filter chips/dropdown' })
  findCategories() {
    return this.opportunitiesService.findCategories();
  }

  /** Powers the "N New Openings" hero card. */
  @Get('count-new')
  @ApiOperation({ summary: 'Count of new openings for the hero card' })
  countNew() {
    return this.opportunitiesService.countNew();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single opportunity by id' })
  findOne(@Param('id') id: string) {
    return this.opportunitiesService.findOne(id);
  }

  // ───────────────────────── Admin: manual opportunities ─────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a manual opportunity (admin only)' })
  create(@Body() dto: CreateOpportunityDto) {
    return this.opportunitiesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update an opportunity (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opportunitiesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft-remove an opportunity (admin only)' })
  remove(@Param('id') id: string) {
    return this.opportunitiesService.remove(id);
  }

  // ───────────────────────── Admin: API-sourced opportunities ─────────────────────────

  /** Manually kick off a pull from the external provider(s) instead of
   *  waiting for the scheduled sync — lets an admin refresh the feed on
   *  demand (e.g. right after configuring a new search query/keyword). */
  @Post('sync')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Manually trigger a sync from the external provider (admin only)' })
  sync(@Query('query') query?: string) {
    return this.syncService.syncNow(query);
  }
}
