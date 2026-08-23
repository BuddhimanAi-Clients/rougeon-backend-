import { AppError } from '../../shared/errors/app-error.js';
import type {
  CreateAddressBody,
  UpdateAddressBody,
} from './address.schemas.js';
import * as addressRepository from './address.repository.js';

export function getAddresses(userId: string) {
  return addressRepository.listAddresses(userId);
}

export function createAddress(userId: string, input: CreateAddressBody) {
  return addressRepository.runAddressTransaction(async (transaction) => {
    await addressRepository.lockUser(transaction, userId);
    const isFirstAddress =
      (await addressRepository.countAddresses(transaction, userId)) === 0;
    const isDefault = input.isDefault || isFirstAddress;
    if (isDefault) {
      await addressRepository.unsetDefaults(transaction, userId);
    }
    return addressRepository.createAddress(
      transaction,
      userId,
      input,
      isDefault,
    );
  });
}

export function updateAddress(
  userId: string,
  id: string,
  input: UpdateAddressBody,
) {
  return addressRepository.runAddressTransaction(async (transaction) => {
    await addressRepository.lockUser(transaction, userId);
    if (!(await addressRepository.findAddress(transaction, userId, id))) {
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address was not found');
    }
    if (input.isDefault === true) {
      await addressRepository.unsetDefaults(transaction, userId, id);
    }
    return addressRepository.updateAddress(transaction, id, input);
  });
}

export function makeDefault(userId: string, id: string) {
  return addressRepository.runAddressTransaction(async (transaction) => {
    await addressRepository.lockUser(transaction, userId);
    if (!(await addressRepository.findAddress(transaction, userId, id))) {
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address was not found');
    }
    await addressRepository.unsetDefaults(transaction, userId, id);
    return addressRepository.setDefault(transaction, id);
  });
}

export function deleteAddress(userId: string, id: string) {
  return addressRepository.runAddressTransaction(async (transaction) => {
    await addressRepository.lockUser(transaction, userId);
    const address = await addressRepository.findAddress(transaction, userId, id);
    if (!address) {
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address was not found');
    }
    await addressRepository.deleteAddress(transaction, id);
    if (address.isDefault) {
      const replacement = await addressRepository.findFirstAddress(
        transaction,
        userId,
      );
      if (replacement) {
        await addressRepository.setDefault(transaction, replacement.id);
      }
    }
  });
}
