/**
 * Seed script — creates a superuser/admin account for testing.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register prisma/seed.ts
 *
 * Or add to package.json scripts:
 *   "seed": "ts-node -r tsconfig-paths/register prisma/seed.ts"
 *
 * Then run: npm run seed
 *
 * The account is pre-verified so you can log straight in — no OTP needed.
 */

import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SUPER_USER = {
  email: 'superadmin@gmbt.dev',
  password: 'SuperAdmin@Launch2026!', // Change before going to prod!
  firstname: 'Super',
  lastname: 'Admin',
  organization: 'GMBT',
  role: UserRole.ADMIN,
};

async function main() {
  console.log('🌱 Seeding superuser account...');

  const existing = await prisma.user.findUnique({
    where: { email: SUPER_USER.email },
  });

  if (existing) {
    console.log(`ℹ️  User ${SUPER_USER.email} already exists — skipping creation.`);
    console.log(`   isVerified: ${existing.isVerified}`);
    console.log(`   role: ${existing.role}`);

    // Make sure it's verified + ADMIN in case it was created manually before
    if (!existing.isVerified || existing.role !== UserRole.ADMIN) {
      await prisma.user.update({
        where: { email: SUPER_USER.email },
        data: { isVerified: true, role: UserRole.ADMIN },
      });
      console.log('   ✅ Updated to ADMIN + verified.');
    }
    return;
  }

  const hashedPassword = await bcrypt.hash(SUPER_USER.password, 12);

  const user = await prisma.user.create({
    data: {
      email: SUPER_USER.email,
      password: hashedPassword,
      firstname: SUPER_USER.firstname,
      lastname: SUPER_USER.lastname,
      organization: SUPER_USER.organization,
      role: SUPER_USER.role,
      isVerified: true,      // skip email verification
      agreedToTerms: true,
    },
  });

  console.log('✅ Superuser created!');
  console.log('');
  console.log('  ┌──────────────────────────────────────┐');
  console.log(`  │  Email   : ${SUPER_USER.email.padEnd(27)}│`);
  console.log(`  │  Password: ${SUPER_USER.password.padEnd(27)}│`);
  console.log(`  │  Role    : ${user.role?.padEnd(27)}│`);
  console.log('  └──────────────────────────────────────┘');
  console.log('');
  console.log('  ⚠️  Change the password before deploying to production!');
}

/**
 * Catalogue seed data below. Unlike the mock arrays that used to live in the
 * frontend, this is legitimate to seed: mentors/courses/events/spotlight
 * stories are admin-curated *catalogue* content (like products in a store),
 * not fabricated per-user activity. A user's own stats (sessions completed,
 * badges earned, activity feed) are NEVER seeded — those only exist once a
 * real user does something, and start at 0/empty otherwise.
 */
async function seedCatalogue() {
  console.log('🌱 Seeding mentor/course/event/spotlight catalogue...');

  // Mentor has no unique field besides `id`, so skipDuplicates on createMany
  // can't catch repeats — every seed run would insert these again. Instead,
  // check which names already exist and only create what's missing, same
  // idea as the email-existence check in seedTeamAccounts() above.
  const mentorSeeds = [
    {
      name: 'Sophia Turner',
      role: 'Software Engineer, Google',
      company: 'Google',
      avatarUrl: null,
      bio: 'Helping students navigate the world of software engineering and career growth.',
      skills: ['Career Growth', 'UX Design', 'Leadership'],
    },
    {
      name: 'Victor Marcus',
      role: 'Product Designer, Code Nation',
      company: 'Code Nation',
      avatarUrl: null,
      bio: 'Full-stack and cloud architecture mentor focused on practical, hands-on guidance.',
      skills: ['Full Stack', 'Cloud Architecture', 'Mentoring'],
    },
    {
      name: 'James Ade',
      role: 'Software Engineer, Google',
      company: 'Google',
      avatarUrl: null,
      bio: 'Passionate about bridging creativity and real-world design for impactful products.',
      skills: ['Career Growth', 'UX Design', 'Leadership'],
    },
    {
      name: 'Amara Okafor',
      role: 'Data Scientist, Microsoft',
      company: 'Microsoft',
      avatarUrl: null,
      bio: 'Guiding mentees through data science fundamentals and real-world model building.',
      skills: ['Data Science', 'Machine Learning', 'Python'],
    },
    {
      name: 'Daniel Osei',
      role: 'Backend Engineer, Amazon',
      company: 'Amazon',
      avatarUrl: null,
      bio: 'Focused on distributed systems, APIs, and helping mentees ship production-ready code.',
      skills: ['Backend Development', 'System Design', 'APIs'],
    },
    {
      name: 'Grace Mensah',
      role: 'Product Manager, Meta',
      company: 'Meta',
      avatarUrl: null,
      bio: 'Helping early-career talent break into product management and stakeholder strategy.',
      skills: ['Product Management', 'Strategy', 'Communication'],
    },
    {
      name: 'Kwame Asante',
      role: 'DevOps Engineer, IBM',
      company: 'IBM',
      avatarUrl: null,
      bio: 'Mentoring on CI/CD, cloud infrastructure, and building reliable deployment pipelines.',
      skills: ['DevOps', 'Cloud Infrastructure', 'Automation'],
    },
    {
      name: 'Chidinma Eze',
      role: 'UX Researcher, Spotify',
      company: 'Spotify',
      avatarUrl: null,
      bio: 'Passionate about user-centered design and translating research into product decisions.',
      skills: ['UX Research', 'Design Thinking', 'Prototyping'],
    },
    {
      name: 'Tunde Bello',
      role: 'Mobile Engineer, Uber',
      company: 'Uber',
      avatarUrl: null,
      bio: 'Supporting mentees building their first mobile apps, from architecture to app store launch.',
      skills: ['Mobile Development', 'React Native', 'iOS'],
    },
    {
      name: 'Ngozi Adichie',
      role: 'Security Engineer, Cloudflare',
      company: 'Cloudflare',
      avatarUrl: null,
      bio: 'Teaching practical security fundamentals for engineers building customer-facing products.',
      skills: ['Security', 'Networking', 'Risk Assessment'],
    },
    {
      name: 'Emeka Obi',
      role: 'Founder & CEO, Adanian Labs',
      company: 'Adanian Labs',
      avatarUrl: null,
      bio: 'Advising founders on early-stage strategy, fundraising, and building for African markets.',
      skills: ['Entrepreneurship', 'Fundraising', 'Business Strategy'],
    },
    {
      name: 'Fatima Suleiman',
      role: 'Marketing Lead, Adanian Labs',
      company: 'Adanian Labs',
      avatarUrl: null,
      bio: 'Mentoring on brand building, growth marketing, and go-to-market strategy for startups.',
      skills: ['Marketing', 'Branding', 'Growth Strategy'],
    },
    {
      name: 'Olumide Fashola',
      role: 'Software Architect, Oracle',
      company: 'Oracle',
      avatarUrl: null,
      bio: 'Helping mentees think through system architecture and scalable database design.',
      skills: ['Software Architecture', 'Databases', 'Scalability'],
    },
    {
      name: 'Zainab Hassan',
      role: 'AI Research Engineer, DeepMind',
      company: 'DeepMind',
      avatarUrl: null,
      bio: 'Introducing mentees to applied AI research and practical model deployment.',
      skills: ['Artificial Intelligence', 'Research', 'Deep Learning'],
    },
    {
      name: 'Ifeoma Chukwu',
      role: 'Frontend Engineer, Shopify',
      company: 'Shopify',
      avatarUrl: null,
      bio: 'Mentoring on component-driven frontend architecture and accessible UI development.',
      skills: ['Frontend Development', 'React', 'Accessibility'],
    },
  ];

  const existingMentors = await prisma.mentor.findMany({
    where: { name: { in: mentorSeeds.map((m) => m.name) } },
    select: { name: true },
  });
  const existingMentorNames = new Set(existingMentors.map((m) => m.name));
  const newMentors = mentorSeeds.filter((m) => !existingMentorNames.has(m.name));

  if (newMentors.length) {
    await prisma.mentor.createMany({ data: newMentors });
    console.log(`  ➕ ${newMentors.length} new mentor(s) added.`);
  } else {
    console.log('  ℹ️  All seed mentors already exist — nothing added.');
  }

  // NOTE: totalModules is intentionally omitted — it's a computed cache now
  // (COUNT of that course's Module rows) and starts at 0 for every course
  // until content is actually uploaded via POST /courses/:id/modules.
  // category: 'education' surfaces these on the Academy page; use
  // category: 'climate' for Green Impact courses.
  await prisma.course.createMany({
    skipDuplicates: true,
    data: [
      { title: 'Digital Marketing Strategy', slug: 'digital-marketing-strategy', category: 'education' },
      { title: 'Business Analytics Basics', slug: 'business-analytics-basics', category: 'education' },
      { title: 'Startup Fundamentals', slug: 'startup-fundamentals', category: 'education' },
      { title: 'Entrepreneurship Mindset', slug: 'entrepreneurship-mindset', category: 'education' },
      { title: 'Financial Literacy for Founders', slug: 'financial-literacy-for-founders', category: 'education' },
      {
        title: 'Product Sales & Marketing Brand Development',
        slug: 'product-sales-marketing-brand-development',
        category: 'education',
      },
    ],
  });

  // Same issue as Mentor: Event has no unique field besides `id`, so
  // skipDuplicates on createMany can't catch repeats. Check existing
  // titles first and only create what's missing.
  const now = new Date();
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
  const eventSeeds = [
    { title: 'AI Workshop at Adanian Labs', location: 'Adanian Labs', startsAt: daysFromNow(7) },
    { title: 'Startup Fundamentals Bootcamp', location: 'Adanian Labs', startsAt: daysFromNow(14) },
    { title: 'Mentorship Mixer', location: 'Adanian Labs', startsAt: daysFromNow(21) },
    { title: 'Product Design Sprint', location: 'Adanian Labs', startsAt: daysFromNow(28) },
    { title: 'Green Impact Hackathon', location: 'Adanian Labs', startsAt: daysFromNow(35) },
    { title: 'Career Growth Panel', location: 'Adanian Labs', startsAt: daysFromNow(42) },
    { title: 'Data & Analytics Masterclass', location: 'Adanian Labs', startsAt: daysFromNow(49) },
    { title: 'Founders Fireside Chat', location: 'Adanian Labs', startsAt: daysFromNow(56) },
    { title: 'Community Demo Day', location: 'Adanian Labs', startsAt: daysFromNow(63) },
  ];

  const existingEvents = await prisma.event.findMany({
    where: { title: { in: eventSeeds.map((e) => e.title) } },
    select: { title: true },
  });
  const existingEventTitles = new Set(existingEvents.map((e) => e.title));
  const newEvents = eventSeeds.filter((e) => !existingEventTitles.has(e.title));

  if (newEvents.length) {
    await prisma.event.createMany({ data: newEvents });
    console.log(`  ➕ ${newEvents.length} new event(s) added.`);
  } else {
    console.log('  ℹ️  All seed events already exist — nothing added.');
  }

  // Same fix as above: SpotlightStory has no unique field besides `id`.
  const spotlightSeeds = [
    {
      title: 'From Student to Senior Developer',
      description:
        "How mentorship transformed James' journey from feeling uncertain about his future to landing his dream job at a Manchester tech startup.",
      authorName: 'James Wilson',
      authorRole: 'Software Developer',
    },
  ];

  const existingSpotlights = await prisma.spotlightStory.findMany({
    where: { title: { in: spotlightSeeds.map((s) => s.title) } },
    select: { title: true },
  });
  const existingSpotlightTitles = new Set(existingSpotlights.map((s) => s.title));
  const newSpotlights = spotlightSeeds.filter((s) => !existingSpotlightTitles.has(s.title));

  if (newSpotlights.length) {
    await prisma.spotlightStory.createMany({ data: newSpotlights });
    console.log(`  ➕ ${newSpotlights.length} new spotlight stor${newSpotlights.length === 1 ? 'y' : 'ies'} added.`);
  } else {
    console.log('  ℹ️  All seed spotlight stories already exist — nothing added.');
  }

  // Green Exchange listings — a real, admin-managed catalogue like the rest
  // above. pointsPerCredit/availableQuantity are genuine starting values an
  // admin can change any time via PATCH /green-exchange/admin/listings/:id;
  // nothing about a user's balance or ownership is seeded here.
  // Same fix as above: CreditListing has no unique field besides `id`.
  const creditListingSeeds = [
    {
      title: 'Forest Conservation Credits',
      description: 'Support verified reforestation work across Greater Manchester.',
      pointsPerCredit: 8,
      availableQuantity: 500,
    },
    {
      title: 'Clean Water Credits',
      description: 'Fund clean water access initiatives in the region.',
      pointsPerCredit: 4,
      availableQuantity: 750,
    },
    {
      title: 'Renewable Energy Credits',
      description: 'Back local renewable energy generation projects.',
      pointsPerCredit: 5,
      availableQuantity: 1000,
    },
  ];

  const existingCreditListings = await prisma.creditListing.findMany({
    where: { title: { in: creditListingSeeds.map((c) => c.title) } },
    select: { title: true },
  });
  const existingCreditListingTitles = new Set(existingCreditListings.map((c) => c.title));
  const newCreditListings = creditListingSeeds.filter((c) => !existingCreditListingTitles.has(c.title));

  if (newCreditListings.length) {
    await prisma.creditListing.createMany({ data: newCreditListings });
    console.log(`  ➕ ${newCreditListings.length} new credit listing(s) added.`);
  } else {
    console.log('  ℹ️  All seed credit listings already exist — nothing added.');
  }

  // Climate report cards — editable copy pieces, not numeric data. An admin
  // can add/retire these any time via /green-impact/reports.
  // Same fix as above: ClimateReport has no unique field besides `id`.
  const climateReportSeeds = [
    {
      title: 'Manchester Climate Action Plan 2026',
      description: "Latest updates on the city's carbon neutrality roadmap",
    },
    {
      title: 'Green Economy Growth Report',
      description: 'Analysis of sustainable business trends in the region',
    },
  ];

  const existingClimateReports = await prisma.climateReport.findMany({
    where: { title: { in: climateReportSeeds.map((c) => c.title) } },
    select: { title: true },
  });
  const existingClimateReportTitles = new Set(existingClimateReports.map((c) => c.title));
  const newClimateReports = climateReportSeeds.filter((c) => !existingClimateReportTitles.has(c.title));

  if (newClimateReports.length) {
    await prisma.climateReport.createMany({ data: newClimateReports });
    console.log(`  ➕ ${newClimateReports.length} new climate report(s) added.`);
  } else {
    console.log('  ℹ️  All seed climate reports already exist — nothing added.');
  }

  console.log('✅ Catalogue seeded (mentors, courses, events, spotlight, green exchange, climate reports).');
}

/**
 * Creates 25 pre-verified team accounts + a special Dr. Emilee account.
 * Accounts bypass email verification and are safe to re-run.
 */
async function seedTeamAccounts() {
  console.log('🌱 Seeding 25 team accounts + Dr. Emilee (bypassing email verification)...');

  const accounts = [
    ...Array.from({ length: 25 }, (_, i) => {
      const n = i + 1;

      return {
        email: `team${n}@gmbt.dev`,
        password: `Team${n}@Launch2026!`,
        firstname: 'Team',
        lastname: `Member ${n}`,
        organization: 'GMBT',
        role: UserRole.STUDENT,
      };
    }),

    // Special account AleroDoyle
    {
      email: 'alerodoyle@gmbte.dev',
      password: 'AleroDoyle1999!',
      firstname: 'Alero',
      lastname: 'Doyle',
      organization: 'GMBT',
      role: UserRole.ENGINEER, // Change to ADMIN if preferred
    },
  ];

  const created: typeof accounts = [];

  for (const acc of accounts) {
    const existing = await prisma.user.findUnique({
      where: { email: acc.email },
    });

    if (existing) {
      console.log(`ℹ️  ${acc.email} already exists — skipping.`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(acc.password, 12);

    await prisma.user.create({
      data: {
        email: acc.email,
        password: hashedPassword,
        firstname: acc.firstname,
        lastname: acc.lastname,
        organization: acc.organization,
        role: acc.role,
        isVerified: true,
        agreedToTerms: true,
      },
    });

    created.push(acc);
  }

  if (created.length) {
    console.log('✅ Accounts created:');
    console.log('');

    for (const acc of created) {
      console.log(`  ${acc.email}  /  ${acc.password}`);
    }

    console.log('');
    console.log('  ⚠️  Ask each user to change their password after first login.');
  } else {
    console.log('ℹ️  All team accounts already existed — nothing created.');
  }
}

/**
 * Badge catalogue — definitions only (metric + target), same "admin-curated
 * catalogue, not per-user activity" reasoning as seedCatalogue() above.
 * Earning happens later, for real, via BadgesService.evaluate() — nothing
 * here ever inserts a UserBadge row.
 */
async function seedBadges() {
  console.log('🌱 Seeding badge catalogue...');

  await prisma.badge.createMany({
    skipDuplicates: true,
    data: [
      { name: 'Fast Starter', description: 'Complete your first module', metric: 'MODULES_COMPLETED', target: 1 },
      { name: '3 Courses', description: 'Complete 3 courses', metric: 'COURSES_COMPLETED', target: 3 },
      { name: 'Top Learner', description: 'Complete 10 courses', metric: 'COURSES_COMPLETED', target: 10 },
      { name: 'Community', description: 'Register for your first event', metric: 'EVENTS_ATTENDED', target: 1 },
      { name: 'Regular', description: 'Register for 5 events', metric: 'EVENTS_ATTENDED', target: 5 },
      { name: 'Mentored', description: 'Get matched with a mentor', metric: 'MENTOR_CONNECTIONS', target: 1 },
      { name: 'First Action Logged', description: 'Log your first green action', metric: 'GREEN_ACTIONS_LOGGED', target: 1 },
      { name: '10 Actions Logged', description: 'Log 10 green actions', metric: 'GREEN_ACTIONS_LOGGED', target: 10 },
      { name: '100kg CO2 Offset', description: 'Offset 100kg of CO2', metric: 'GREEN_CO2_KG', target: 100 },
    ],
  });

  console.log('✅ Badge catalogue seeded.');
}

main()
  .then(() => seedTeamAccounts())
  .then(() => seedCatalogue())
  .then(() => seedBadges())
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
