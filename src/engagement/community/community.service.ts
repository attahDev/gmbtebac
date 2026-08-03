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
import { ModerationService } from './moderation.service';

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
    private moderationService: ModerationService,
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

          status: PostStatus.APPROVED,
          approvedAt: new Date(),
        },
      });


    await this.notificationsService.notifyUser(
      userId,
      {
        category:
          NotificationCategory.COMMUNITY,

        title:
          'Your post is live',

        body:
          `"${post.title}" is now visible in the community feed.`,

        metadata: {
          storyId: post.id,
        },
      },
    );

    await this.activityService.log(
      userId,
      'COMMUNITY_POST_SUBMITTED',
      `Posted "${post.title}" to the community feed`,
      { storyId: post.id },
    );

    // Fire-and-forget: the post is already live, so this check runs after
    // the fact rather than gating publication. If it comes back flagged,
    // moderatePost pulls the post from the public feed and alerts admins.
    this.moderatePost(post.id, `${post.title}\n\n${post.description}`).catch(
      () => {
        /* moderatePost already logs its own failures */
      },
    );


    return post;
  }

  /** Runs the automated content check against a just-published post. Only
   *  touches the row if it comes back flagged — a clean result leaves the
   *  post exactly as published. */
  private async moderatePost(storyId: string, text: string) {
    const result = await this.moderationService.checkText(text);
    if (!result.flagged) return;

    const post = await this.prisma.spotlightStory.update({
      where: { id: storyId },
      data: {
        status: PostStatus.FLAGGED,
        flagReason: result.reason,
      },
    });

    if (post.authorId) {
      await this.notificationsService.notifyUser(post.authorId, {
        category: NotificationCategory.COMMUNITY,
        title: 'Your post was flagged for review',
        body: `"${post.title}" was pulled from the feed pending admin review.`,
        metadata: { storyId },
      });
    }

    await this.notificationsService.notifyAdmins({
      category: NotificationCategory.COMMUNITY,
      title: 'Flagged community post needs review',
      body: `"${post.title}" by ${post.authorName} was flagged: ${result.reason}`,
      actionLabel: 'Review',
      actionUrl: '/dashboard/admin/community',
      metadata: { storyId, authorId: post.authorId },
    });
  }

  // ---------------- COMMENTS ----------------

  async findComments(storyId: string) {
    const post =
      await this.prisma.spotlightStory.findUnique({
        where: {
          id: storyId,
        },
      });


    if (!post || post.status !== PostStatus.APPROVED) {
      throw new NotFoundException('Post not found');
    }


    const comments = await this.prisma.comment.findMany({
      where: {
        postId: storyId,
        flagged: false,
      },

      orderBy: {
        createdAt: 'asc',
      },
    });

    return this.attachAuthors(comments);
  }

  /** Comment no longer has a Prisma relation to User (the live `comments`
   *  table is flat — just an authorId column, no FK declared) so author
   *  names are fetched separately and merged in, instead of `include`. */
  private async attachAuthors<T extends { authorId: string }>(
    comments: T[],
  ): Promise<(T & { author: { firstname: string; lastname: string } })[]> {
    if (!comments.length) return [];

    const authorIds = [...new Set(comments.map((c) => c.authorId))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, firstname: true, lastname: true },
    });
    const byId = new Map(authors.map((a) => [a.id, a]));

    return comments.map((c) => {
      const author = byId.get(c.authorId);
      return {
        ...c,
        author: {
          firstname: author?.firstname ?? 'Unknown',
          lastname: author?.lastname ?? '',
        },
      };
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


    if (!post || post.status !== PostStatus.APPROVED) {
      throw new NotFoundException('Post not found');
    }



    const [comment] =
      await this.prisma.$transaction([

        this.prisma.comment.create({
          data: {
            postId: storyId,

            authorId: userId,

            content:
              content.trim(),
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


    // Same post-then-moderate treatment as createPost: the comment is
    // already live, this only acts on it if the check comes back flagged.
    this.moderateComment(comment.id, content).catch(() => {
      /* moderateComment already logs its own failures */
    });

    const [withAuthor] = await this.attachAuthors([comment]);
    return withAuthor;
  }

  /** Runs the automated content check against a just-posted comment. Only
   *  touches the row if it comes back flagged. */
  private async moderateComment(commentId: string, text: string) {
    const result = await this.moderationService.checkText(text);
    if (!result.flagged) return;

    const comment = await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        flagged: true,
        flagReason: result.reason,
      },
    });

    if (comment.authorId) {
      await this.notificationsService.notifyUser(comment.authorId, {
        category: NotificationCategory.COMMUNITY,
        title: 'Your comment was flagged for review',
        body: 'Your comment was hidden pending admin review.',
        metadata: { commentId },
      });
    }

    await this.notificationsService.notifyAdmins({
      category: NotificationCategory.COMMUNITY,
      title: 'Flagged comment needs review',
      body: `A comment was flagged: ${result.reason}`,
      actionLabel: 'Review',
      actionUrl: '/dashboard/admin/community',
      metadata: { commentId, postId: comment.postId },
    });
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


    if (comment.authorId !== userId) {
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
          id: comment.postId,
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
          id: comment.postId,
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

  /** Posts the moderation bot flagged post-publish, awaiting admin review.
   *  (Endpoint name/route kept as "pending" for API stability — the queue's
   *  contents are now flagged posts, not pre-approval submissions.) */
  async findFlagged() {
    return this.prisma.spotlightStory.findMany({
      where: {
        status: PostStatus.FLAGGED,
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
          flagReason: null,
        },

      });



    if (post.authorId) {

      await this.notificationsService.notifyUser(
        post.authorId,
        {

          category:
            NotificationCategory.COMMUNITY,

          title:
            `Your post is back up: "${post.title}"`,

          body:
            'An admin reviewed it and it\'s visible in the community feed again.',

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

  /** Admin decided a flagged post should come down for good. Hard-delete
   *  rather than a soft REJECTED status, per the moderation workflow: a
   *  flagged post is either restored (approve) or removed (this). */
  async deleteFlaggedPost(
    storyId: string,
    reason?: string,
  ) {

    const post = await this.prisma.spotlightStory.findUnique({
      where: { id: storyId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.prisma.spotlightStory.delete({
      where: { id: storyId },
    });

    if (post.authorId) {

      await this.notificationsService.notifyUser(
        post.authorId,
        {

          category:
            NotificationCategory.COMMUNITY,


          title:
            `Your post was removed: "${post.title}"`,


          body:
            reason ||
            post.flagReason ||
            "It didn't meet the community guidelines.",

          metadata: {},

        },
      );

    }

    return { removed: true };
  }

  // ---------------- ADMIN COMMENT MODERATION ----------------

  async findFlaggedComments() {
    const comments = await this.prisma.comment.findMany({
      where: { flagged: true },
      orderBy: { createdAt: 'asc' },
    });
    return this.attachAuthors(comments);
  }

  async approveComment(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { flagged: false, flagReason: null },
    });
  }
}
