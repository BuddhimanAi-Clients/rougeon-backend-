import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
} from '../../shared/validation/validation.middleware.js';
import type {
  AddressIdParams,
  CreateAddressBody,
  UpdateAddressBody,
} from './address.schemas.js';
import * as addressService from './address.service.js';

export const listAddresses: RequestHandler = async (request, response) => {
  response.status(200).json({
    data: await addressService.getAddresses(request.auth!.user.id),
  });
};

export const createAddress: RequestHandler = async (request, response) => {
  response.status(201).json({
    data: await addressService.createAddress(
      request.auth!.user.id,
      validatedBody<CreateAddressBody>(request),
    ),
  });
};

export const updateAddress: RequestHandler = async (request, response) => {
  const { id } = validatedParams<AddressIdParams>(request);
  response.status(200).json({
    data: await addressService.updateAddress(
      request.auth!.user.id,
      id,
      validatedBody<UpdateAddressBody>(request),
    ),
  });
};

export const deleteAddress: RequestHandler = async (request, response) => {
  const { id } = validatedParams<AddressIdParams>(request);
  await addressService.deleteAddress(request.auth!.user.id, id);
  response.status(200).json({ message: 'Address deleted' });
};

export const makeDefault: RequestHandler = async (request, response) => {
  const { id } = validatedParams<AddressIdParams>(request);
  response.status(200).json({
    data: await addressService.makeDefault(request.auth!.user.id, id),
  });
};
