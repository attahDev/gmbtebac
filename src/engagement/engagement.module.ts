import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { RolesGuard } from '../guards/roles.guard';

import { ActivityService } from './activity/activity.service';
import { ActivityController, ActivityInternalController } from './activity/activity.controller';

import { NotificationsService } from './notifications/notifications.service';
import { NotificationsController } from './notifications/notifications.controller';

import { MentorsService } from './mentors/mentors.service';
import { MentorsController } from './mentors/mentors.controller';

import { CareerPathsService } from './career-paths/career-paths.service';
import { CareerPathsController } from './career-paths/career-paths.controller';

import { OpportunitiesService } from './opportunities/opportunities.service';
import { OpportunitiesSyncService } from './opportunities/opportunities-sync.service';
import { OpportunitiesController } from './opportunities/opportunities.controller';

import { CoursesService } from './courses/courses.service';
import { PdfExtractionService } from './courses/pdf-extraction.service';
import { CoursesController } from './courses/courses.controller';

import { EventsService } from './events/events.service';
import { EventsController } from './events/events.controller';

import { NewsService } from './news/news.service';
import { NewsController } from './news/news.controller';

import { CommunityService } from './community/community.service';
import { CommunityController } from './community/community.controller';
import { CommunityCleanupService } from './community/community-cleanup.service';

import { DashboardService } from './dashboard/dashboard.service';
import { DashboardController } from './dashboard/dashboard.controller';

import { TributesService } from './tributes/tributes.service';
import { TributesController } from './tributes/tributes.controller';

import { NominationsService } from './nominations/nominations.service';
import { NominationsController } from './nominations/nominations.controller';

import { GreenImpactService } from './green-impact/green-impact.service';
import { GreenImpactController } from './green-impact/green-impact.controller';

import { ClimateDataService } from './green-impact/climate-data.service';

import { ExchangeService } from './green-impact/exchange.service';
import { ExchangeController } from './green-impact/exchange.controller';

import { GreenProjectsService } from './green-projects/green-projects.service';
import { GreenProjectsController } from './green-projects/green-projects.controller';

import { BadgesService } from './badges/badges.service';
import { BadgesController } from './badges/badges.controller';


@Module({
  imports: [
    PrismaModule,
    HttpModule,
    UploadsModule,
  ],

  controllers: [
    ActivityController,
    ActivityInternalController,
    NotificationsController,

    MentorsController,

    CareerPathsController,

    OpportunitiesController,

    CoursesController,

    EventsController,

    NewsController,

    CommunityController,

    DashboardController,

    TributesController,

    NominationsController,

    GreenImpactController,

    ExchangeController,

    GreenProjectsController,

    BadgesController,
  ],

  providers: [
    ActivityService,

    NotificationsService,

    MentorsService,

    CareerPathsService,

    OpportunitiesService,
    OpportunitiesSyncService,

    CoursesService,
    PdfExtractionService,

    EventsService,

    NewsService,

    CommunityService,
    CommunityCleanupService,

    DashboardService,

    TributesService,

    NominationsService,

    GreenImpactService,
    ClimateDataService,

    ExchangeService,

    GreenProjectsService,

    BadgesService,

    RolesGuard,
  ],

exports: [
    ActivityService,
    OpportunitiesService,
    OpportunitiesSyncService,
    CoursesService,
    PdfExtractionService,
    NotificationsService,
    BadgesService,
  ],
})

export class EngagementModule {}
