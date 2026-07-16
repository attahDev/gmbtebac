import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from '../guards/roles.guard';

import { ActivityService } from './activity/activity.service';
import { ActivityController } from './activity/activity.controller';

import { MentorsService } from './mentors/mentors.service';
import { MentorsController } from './mentors/mentors.controller';

import { OpportunitiesService } from './opportunities/opportunities.service';
import { OpportunitiesController } from './opportunities/opportunities.controller';

import { CoursesService } from './courses/courses.service';
import { CoursesController } from './courses/courses.controller';

import { EventsService } from './events/events.service';
import { EventsController } from './events/events.controller';

import { CommunityService } from './community/community.service';
import { CommunityController } from './community/community.controller';

import { DashboardService } from './dashboard/dashboard.service';
import { DashboardController } from './dashboard/dashboard.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    ActivityController,
    MentorsController,
    OpportunitiesController,
    CoursesController,
    EventsController,
    CommunityController,
    DashboardController,
  ],
  providers: [
    ActivityService,
    MentorsService,
    OpportunitiesService,
    CoursesService,
    EventsService,
    CommunityService,
    DashboardService,
    RolesGuard,
  ],
  exports: [ActivityService],
})
export class EngagementModule {}
