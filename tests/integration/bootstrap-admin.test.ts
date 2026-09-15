import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { UserRole } from '@prisma/client';
import { prisma } from '../../src/configs/database.config.js';
import { bootstrapInitialAdmin } from '../../src/shared/auth/bootstrap-admin.service.js';

async function truncateTestData() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
}

before(async () => {
  await prisma.$connect();
  await truncateTestData();
});

after(async () => {
  await truncateTestData();
  await prisma.$disconnect();
});

test('bootstrap creates exactly one verified active administrator', async () => {
  const created = await bootstrapInitialAdmin({
    name: 'Initial Admin',
    email: 'initial-admin@example.com',
    password: 'StrongPassword123!',
  });

  assert.equal(created.role, UserRole.admin);
  assert.equal(created.isActive, true);
  assert.equal(created.emailVerified, true);
  assert.equal(created.email, 'initial-admin@example.com');
  assert.equal(await prisma.account.count({ where: { userId: created.id } }), 1);

  await assert.rejects(
    () => bootstrapInitialAdmin({ name: 'Second Admin', email: 'second-admin@example.com', password: 'StrongPassword123!' }),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'BOOTSTRAP_ADMIN_EXISTS',
  );
  assert.equal(await prisma.user.count({ where: { role: UserRole.admin, isActive: true } }), 1);
  assert.equal(await prisma.user.count({ where: { email: 'second-admin@example.com' } }), 0);
});
