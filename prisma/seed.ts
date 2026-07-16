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
  email: 'admin@gmbt.dev',
  password: 'Admin@12345!', // Change before going to prod!
  firstname: 'Super',
  lastname: 'Admin',
  organization: 'GMBT',
  role: UserRole.ENGINEER,
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

  await prisma.mentor.createMany({
    skipDuplicates: true,
    data: [
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
    ],
  });

  await prisma.course.createMany({
    skipDuplicates: true,
    data: [
      { title: 'Digital Marketing Strategy', category: 'Business', totalModules: 6 },
      { title: 'Business Analytics Basics', category: 'Business', totalModules: 5 },
      { title: 'Startup Fundamentals', category: 'Entrepreneurship', totalModules: 4 },
      { title: 'Entrepreneurship Mindset', category: 'Entrepreneurship', totalModules: 4 },
      { title: 'Financial Literacy for Founders', category: 'Finance', totalModules: 5 },
      { title: 'Product Sales & Marketing Brand Development', category: 'Business', totalModules: 6 },
    ],
  });

  const now = new Date();
  const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await prisma.event.createMany({
    skipDuplicates: true,
    data: [
      {
        title: 'AI Workshop at University of Manchester',
        location: 'University of Manchester',
        startsAt: inTwoWeeks,
      },
    ],
  });

  await prisma.spotlightStory.createMany({
    skipDuplicates: true,
    data: [
      {
        title: 'From Student to Senior Developer',
        description:
          "How mentorship transformed James' journey from feeling uncertain about his future to landing his dream job at a Manchester tech startup.",
        authorName: 'James Wilson',
        authorRole: 'Software Developer',
      },
    ],
  });

  console.log('✅ Catalogue seeded (mentors, courses, events, spotlight).');
}

main()
  .then(() => seedCatalogue())
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
