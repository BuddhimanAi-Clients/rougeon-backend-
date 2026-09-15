import { UserRole } from '@prisma/client';
import { auth } from './auth.config.js';
import { prisma } from '../../configs/database.config.js';
import { AppError } from '../errors/app-error.js';

export type BootstrapAdminInput = {
  name: string;
  email: string;
  password: string;
};

function validateInput(input: BootstrapAdminInput) {
  if (!input.name.trim()) throw new AppError(422, 'INVALID_ADMIN_NAME', 'Enter an administrator name');
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new AppError(422, 'INVALID_ADMIN_EMAIL', 'Enter a valid administrator email');
  if (input.password.length < 8) throw new AppError(422, 'INVALID_ADMIN_PASSWORD', 'Administrator password must contain at least 8 characters');
}

/**
 * Creates the first active administrator only. The advisory lock protects the
 * check-and-promote sequence when two setup terminals are run concurrently.
 */
export async function bootstrapInitialAdmin(input: BootstrapAdminInput) {
  validateInput(input);
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const existingAdminCount = await prisma.user.count({ where: { role: UserRole.admin, isActive: true } });
  if (existingAdminCount > 0) throw new AppError(409, 'BOOTSTRAP_ADMIN_EXISTS', 'An active administrator already exists. Use Admin staff management instead.');
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new AppError(409, 'BOOTSTRAP_EMAIL_EXISTS', 'This email is already registered. Use another email or promote the account through a controlled recovery process.');
  }

  let createdUserId: string | undefined;
  try {
    const created = await auth.api.signUpEmail({ body: { name, email, password: input.password } });
    const newUserId = created.user.id;
    createdUserId = newUserId;
    return await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rogueon-bootstrap-admin'))`;
      const activeAdmins = await transaction.user.count({ where: { role: UserRole.admin, isActive: true } });
      if (activeAdmins > 0) throw new AppError(409, 'BOOTSTRAP_ADMIN_EXISTS', 'An active administrator was created while bootstrap was running.');
      return transaction.user.update({
        where: { id: newUserId },
        data: { role: UserRole.admin, isActive: true, emailVerified: true },
        select: { id: true, name: true, email: true, role: true, isActive: true, emailVerified: true },
      });
    });
  } catch (error) {
    if (createdUserId) {
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => undefined);
    }
    throw error;
  }
}
