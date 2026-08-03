import { PrismaService } from 'src/prisma/prisma.service';

const MAX_ITEMS_PER_SECTION = 8;

/** Structured, always-current data — pulled straight from the same tables
 *  the rest of the app reads/writes, so there's nothing extra to keep in
 *  sync: a new job posting shows up here the moment it's created. */
async function fetchStructuredContext(prisma: PrismaService): Promise<string> {
  const [jobs, events, courses] = await Promise.all([
    prisma.opportunity.findMany({
      where: { isActive: true },
      orderBy: { postedAt: 'desc' },
      take: MAX_ITEMS_PER_SECTION,
      select: { title: true, company: true, location: true, type: true, category: true },
    }),
    prisma.event.findMany({
      where: { isActive: true, isCompleted: false, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: MAX_ITEMS_PER_SECTION,
      select: { title: true, mode: true, startsAt: true, location: true },
    }),
    prisma.course.findMany({
      where: { isActive: true },
      orderBy: { isFeatured: 'desc' },
      take: MAX_ITEMS_PER_SECTION,
      select: { title: true, category: true },
    }),
  ]);

  const sections: string[] = [];

  if (jobs.length) {
    sections.push(
      'Current open job/opportunity postings:\n' +
        jobs
          .map((j) => `- ${j.title} at ${j.company}${j.location ? ` (${j.location})` : ''}${j.type ? ` — ${j.type}` : ''}`)
          .join('\n'),
    );
  }

  if (events.length) {
    sections.push(
      'Upcoming events:\n' +
        events
          .map((e) => `- ${e.title} — ${e.startsAt.toDateString()}${e.mode ? ` (${e.mode})` : ''}`)
          .join('\n'),
    );
  }

  if (courses.length) {
    sections.push(
      'Available courses:\n' + courses.map((c) => `- ${c.title}${c.category ? ` (${c.category})` : ''}`).join('\n'),
    );
  }

  return sections.join('\n\n');
}

/** Small, hand-written narrative knowledge — "how mentorship works here",
 *  etc. Deliberately not auto-generated so it stays accurate and on-brand;
 *  admin-maintained via /chatbot/admin/knowledge. */
async function fetchCuratedKnowledge(prisma: PrismaService): Promise<string> {
  const articles = await prisma.knowledgeArticle.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (!articles.length) return '';

  return (
    'Platform knowledge:\n' +
    articles.map((a) => `### ${a.title}\n${a.body}`).join('\n\n')
  );
}

export async function buildPlatformContext(prisma: PrismaService): Promise<string> {
  const [structured, curated] = await Promise.all([
    fetchStructuredContext(prisma),
    fetchCuratedKnowledge(prisma),
  ]);

  return [structured, curated].filter(Boolean).join('\n\n');
}
