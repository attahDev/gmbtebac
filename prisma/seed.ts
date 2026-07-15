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

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
