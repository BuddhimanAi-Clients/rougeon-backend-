import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../shared/validation/validation.middleware.js';
import type {
  CreateStaffBody,
  ListStaffQuery,
  StaffIdParams,
  UpdateStaffBody,
} from './staff.schemas.js';
import * as staffService from './staff.service.js';

export const createStaff: RequestHandler = async (request, response) => {
  const staff = await staffService.createStaff(validatedBody<CreateStaffBody>(request));
  response.status(201).json({ data: staff });
};

export const listStaff: RequestHandler = async (request, response) => {
  response.status(200).json(await staffService.getStaffList(validatedQuery<ListStaffQuery>(request)));
};

export const getStaff: RequestHandler = async (request, response) => {
  const { id } = validatedParams<StaffIdParams>(request);
  response.status(200).json({ data: await staffService.getStaff(id) });
};

export const updateStaff: RequestHandler = async (request, response) => {
  const { id } = validatedParams<StaffIdParams>(request);
  const staff = await staffService.updateStaff(
    id,
    request.auth!.user.id,
    validatedBody<UpdateStaffBody>(request),
  );
  response.status(200).json({ data: staff });
};

export const deactivateStaff: RequestHandler = async (request, response) => {
  const { id } = validatedParams<StaffIdParams>(request);
  await staffService.deactivateStaff(id, request.auth!.user.id);
  response.status(200).json({ message: 'Staff member deactivated' });
};

export const reactivateStaff: RequestHandler = async (request, response) => {
  const { id } = validatedParams<StaffIdParams>(request);
  response.status(200).json({ data: await staffService.reactivateStaff(id) });
};
