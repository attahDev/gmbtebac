import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import { PostStatus, NotificationCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../../uploads/uploads.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/activity.service';

const AVATAR_COLORS = [
  'bg-red-600',
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-purple-600',
];

@Injectable()
export class CommunityService {
  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
    private notificationsService: NotificationsService,
    private activityService: ActivityService,
  ) {}

  async findFeed(userId?: string, limit = 30) {
    const stories = await this.prisma.spotlightStory.findMany({
      where: {
        status: PostStatus.APPROVED,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    if (!userId || stories.length === 0) {
      return stories.map((story) => ({
        ...story,
        hasLiked: false,
      }));
    }

    const likes = await this.prisma.spotlightLike.findMany({
      where: {
        userId,
        storyId: {
          in: stories.map((story) => story.id),
        },
      },
      select: {
        storyId: true,
      },
    });

    const likedIds = new Set(likes.map((like) => like.storyId));

    return stories.map((story) => ({
      ...story,
      hasLiked: likedIds.has(story.id),
    }));
  }


  async findMine(userId: string) {
    return this.prisma.spotlightStory.findMany({
      where: {
        authorId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }


  async like(userId: string, storyId: string) {
    const story = await this.prisma.spotlightStory.findUnique({
      where: {
        id: storyId,
      },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    const existing =
      await this.prisma.spotlightLike.findUnique({
        where: {
          userId_storyId: {
            userId,
            storyId,
          },
        },
      });

    if (existing) {
      return {
        likes: story.likes,
        hasLiked: true,
      };
    }


    const [, updated] = await this.prisma.$transaction([
      this.prisma.spotlightLike.create({
        data: {
          userId,
          storyId,
        },
      }),

      this.prisma.spotlightStory.update({
        where: {
          id: storyId,
        },
        data: {
          likes: {
            increment: 1,
          },
        },
      }),
    ]);


    return {
      likes: updated.likes,
      hasLiked: true,
    };
  }


  async unlike(userId: string, storyId: string) {
    const existing =
      await this.prisma.spotlightLike.findUnique({
        where: {
          userId_storyId: {
            userId,
            storyId,
          },
        },
      });


    if (!existing) {
      const story =
        await this.prisma.spotlightStory.findUnique({
          where: {
            id: storyId,
          },
        });

      return {
        likes: story?.likes ?? 0,
        hasLiked: false,
      };
    }


    const [, updated] = await this.prisma.$transaction([
      this.prisma.spotlightLike.delete({
        where: {
          userId_storyId: {
            userId,
            storyId,
          },
        },
      }),

      this.prisma.spotlightStory.update({
        where: {
          id: storyId,
        },
        data: {
          likes: {
            decrement: 1,
          },
        },
      }),
    ]);


    return {
      likes: updated.likes,
      hasLiked: false,
    };
  }


  async createPost(
    userId: string,
    dto: {
      title: string;
      description: string;
    },
    file?: Express.Multer.File,
  ) {

    if (!dto.title?.trim() || !dto.description?.trim()) {
      throw new BadRequestException(
        'Title and description are required',
      );
    }


    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });


    if (!user) {
      throw new NotFoundException('User not found');
    }


    let imageUrl: string | undefined;


    if (file) {
      const uploaded =
        await this.uploadsService.uploadCommunityImage(file);

      imageUrl = uploaded.url;
    }


    const avatarColor =
      AVATAR_COLORS[
        Math.floor(
          Math.random() * AVATAR_COLORS.length,
        )
      ];


    const post =
      await this.prisma.spotlightStory.create({
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),

          authorName:
            `${user.firstname} ${user.lastname}`,

          authorRole:
            user.organization ||
            'Community Member',

          avatarColor,
          imageUrl,

          authorId: userId,

          status: PostStatus.PENDING,
        },
      });


    await this.notificationsService.notifyUser(
      userId,
      {
        category:
          NotificationCategory.COMMUNITY,

        title:
          'Your post is awaiting approval',

        body:
          `"${post.title}" will appear in the community feed once an admin reviews it.`,

        metadata: {
          storyId: post.id,
        },
      },
    );

    await this.activityService.log(
      userId,
      'COMMUNITY_POST_SUBMITTED',
      `Submitted "${post.title}" to the community feed`,
      { storyId: post.id },
    );


    await this.notificationsService.notifyAdmins({
      category:
        NotificationCategory.COMMUNITY,

      title:
        'New community post pending approval',

      body:
        `${post.authorName} submitted "${post.title}".`,

      actionLabel:
        'Review',

      actionUrl:
        '/dashboard/admin/community',

      metadata: {
        storyId: post.id,
        userId,
      },
    });


    return post;
  }

  // ---------------- COMMENTS ----------------

  async findComments(storyId: string, userId?: string) {
    const post =
      await this.prisma.spotlightStory.findUnique({
        where: {
          id: storyId,
        },
      });


    // Approved posts are public; a pending/rejected post's own author can
    // still see their comment thread — only strangers get a 404 on it.
    if (!post || (post.status !== PostStatus.APPROVED && post.userId !== userId)) {
      throw new NotFoundException('Post not found');
    }


    return this.prisma.comment.findMany({
      where: {
        storyId,
      },

      orderBy: {
        createdAt: 'asc',
      },

      include: {
        user: {
          select: {
            firstname: true,
            lastname: true,
          },
        },
      },
    });
  }



  async addComment(
    userId: string,
    storyId: string,
    content: string,
  ) {

    if (!content?.trim()) {
      throw new BadRequestException(
        'Comment cannot be empty',
      );
    }


    const post =
      await this.prisma.spotlightStory.findUnique({
        where: {
          id: storyId,
        },
      });


    if (!post || (post.status !== PostStatus.APPROVED && post.userId !== userId)) {
      throw new NotFoundException('Post not found');
    }



    const [comment] =
      await this.prisma.$transaction([

        this.prisma.comment.create({
          data: {
            storyId,

            userId,

            content:
              content.trim(),
          },

          include: {
            user: {
              select: {
                firstname: true,
                lastname: true,
              },
            },
          },
        }),


        this.prisma.spotlightStory.update({
          where: {
            id: storyId,
          },

          data: {
            comments: {
              increment: 1,
            },
          },
        }),

      ]);



    if (
      post.authorId &&
      post.authorId !== userId
    ) {

      await this.notificationsService.notifyUser(
        post.authorId,
        {
          category:
            NotificationCategory.COMMUNITY,

          title:
            `New comment on "${post.title}"`,

          actionLabel:
            'View',

          actionUrl:
            '/dashboard/community',

          metadata: {
            storyId,
          },
        },
      );
    }


    return comment;
  }




  async deleteOwnComment(
    userId: string,
    commentId: string,
  ) {

    const comment =
      await this.prisma.comment.findUnique({
        where: {
          id: commentId,
        },
      });


    if (!comment) {
      throw new NotFoundException(
        'Comment not found',
      );
    }


    if (comment.userId !== userId) {
      throw new ForbiddenException(
        'Not your comment',
      );
    }



    await this.prisma.$transaction([

      this.prisma.comment.delete({
        where: {
          id: commentId,
        },
      }),


      this.prisma.spotlightStory.update({
        where: {
          id: comment.storyId,
        },

        data: {
          comments: {
            decrement: 1,
          },
        },
      }),

    ]);


    return {
      removed: true,
    };
  }




  async deleteCommentAdmin(
    commentId: string,
  ) {

    const comment =
      await this.prisma.comment.findUnique({
        where: {
          id: commentId,
        },
      });


    if (!comment) {
      throw new NotFoundException(
        'Comment not found',
      );
    }



    await this.prisma.$transaction([

      this.prisma.comment.delete({
        where: {
          id: commentId,
        },
      }),


      this.prisma.spotlightStory.update({
        where: {
          id: comment.storyId,
        },

        data: {
          comments: {
            decrement: 1,
          },
        },
      }),

    ]);


    return {
      removed: true,
    };
  }



  // ---------------- ADMIN MODERATION ----------------


  async findPending() {

    return this.prisma.spotlightStory.findMany({

      where: {
        status: PostStatus.PENDING,
      },

      orderBy: {
        createdAt: 'asc',
      },

    });

  }




  async approve(
    storyId: string,
  ) {

    const post =
      await this.prisma.spotlightStory.update({

        where: {
          id: storyId,
        },

        data: {
          status: PostStatus.APPROVED,
          approvedAt: new Date(),
        },

      });



    if (post.authorId) {

      await this.notificationsService.notifyUser(
        post.authorId,
        {

          category:
            NotificationCategory.COMMUNITY,

          title:
            `Your post is live: "${post.title}"`,

          body:
            'It now shows up in the community feed for everyone.',

          actionLabel:
            'View Post',

          actionUrl:
            '/dashboard/community',

          metadata: {
            storyId,
          },

        },
      );

    }


    return post;
  }





  async reject(
    storyId: string,
    reason?: string,
  ) {


    const post =
      await this.prisma.spotlightStory.update({

        where: {
          id: storyId,
        },

        data: {
          status: PostStatus.REJECTED,
        },

      });



    if (post.authorId) {


      await this.notificationsService.notifyUser(
        post.authorId,
        {

          category:
            NotificationCategory.COMMUNITY,


          title:
            `Your post wasn't approved: "${post.title}"`,


          body:
            reason ||
            "It didn't meet the community guidelines.",


          metadata: {
            storyId,
          },

        },
      );

    }


    return post;
  }

}
