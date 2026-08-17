import { auth } from '../../shared/auth/auth.config.js';
import { AppError } from '../../shared/errors/app-error.js';
import { paginatedResult } from '../../shared/http/pagination.js';
import type {
  CreateStaffBody,
  ListStaffQuery,
  UpdateStaffBody,
} from './staff.schemas.js';
import * as staffRepository from './staff.repository.js';

type StaffRecord = NonNullable<Awaited<ReturnType<typeof staffRepository.findStaffById>>>;

function toStaffResponse(staff: StaffRecord) {
  return staff;
}

export async function createStaff(input: CreateStaffBody) {
  if (await staffRepository.findUserByEmail(input.email)) {
    throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email address already exists');
  }

  let newUserId: string | undefined;
  try {
    const result = await auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
    });
    newUserId = result.user.id;
    const staff = await staffRepository.runStaffTransaction((transaction) =>
      staffRepository.finalizeNewStaffInTransaction(
        transaction,
        newUserId!,
        input.role,
      ),
    );
    return toStaffResponse(staff);
  } catch (error) {
    if (newUserId) {
      await staffRepository.deleteNewUser(newUserId);
    }
    if (
      error instanceof Error &&
      /already|exist|unique/i.test(error.message)
    ) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email address already exists');
    }
    throw error;
  }
}

export async function getStaffList(query: ListStaffQuery) {
  const [staff, total] = await staffRepository.listStaff(query);
  return paginatedResult(staff.map(toStaffResponse), total, query);
}

export async function getStaff(id: string) {
  const staff = await staffRepository.findStaffById(id);
  if (!staff) {
    throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member was not found');
  }
  return toStaffResponse(staff);
}

export async function updateStaff(
  id: string,
  authenticatedUserId: string,
  input: UpdateStaffBody,
) {
  const current = await staffRepository.findStaffById(id);
  if (!current) {
    throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member was not found');
  }
  if (id === authenticatedUserId && input.role && input.role !== 'admin') {
    throw new AppError(409, 'SELF_DEMOTION_FORBIDDEN', 'You cannot demote yourself');
  }
  if (input.email && input.email !== current.email) {
    const existing = await staffRepository.findUserByEmail(input.email);
    if (existing && existing.id !== id) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email address already exists');
    }
  }

  await staffRepository.runStaffTransaction(async (transaction) => {
    const target = await staffRepository.findStaffState(transaction, id);
    if (!target) throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member was not found');
    if (
      input.role &&
      target.role === 'admin' &&
      input.role !== 'admin' &&
      target.isActive &&
      (await staffRepository.countActiveAdmins(transaction)) <= 1
    ) {
      throw new AppError(409, 'LAST_ADMIN', 'The last active admin cannot be demoted');
    }
    await staffRepository.updateStaffInTransaction(transaction, id, input);
  });
  return getStaff(id);
}

export async function deactivateStaff(id: string, authenticatedUserId: string) {
  if (id === authenticatedUserId) {
    throw new AppError(409, 'SELF_DEACTIVATION_FORBIDDEN', 'You cannot deactivate yourself');
  }
  await staffRepository.runStaffTransaction(async (transaction) => {
    const target = await staffRepository.findStaffState(transaction, id);
    if (!target) throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member was not found');
    if (!target.isActive) {
      throw new AppError(409, 'STAFF_ALREADY_INACTIVE', 'Staff member is already inactive');
    }
    if (
      target.role === 'admin' &&
      (await staffRepository.countActiveAdmins(transaction)) <= 1
    ) {
      throw new AppError(409, 'LAST_ADMIN', 'The last active admin cannot be deactivated');
    }
    await staffRepository.removeStaffAccess(transaction, id);
  });
}

export async function reactivateStaff(id: string) {
  return staffRepository.runStaffTransaction(async (transaction) => {
    const target = await staffRepository.findStaffState(transaction, id);
    if (!target) throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member was not found');
    if (target.isActive) {
      throw new AppError(409, 'STAFF_ALREADY_ACTIVE', 'Staff member is already active');
    }
    if (target.accounts.length === 0) {
      throw new AppError(
        409,
        'STAFF_CREDENTIALS_MISSING',
        'Staff credentials are missing and cannot be reactivated',
      );
    }
    return staffRepository.reactivateStaff(transaction, id);
  });
}
