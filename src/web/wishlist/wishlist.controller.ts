import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
} from '../../shared/validation/validation.middleware.js';
import type {
  AddWishlistItemBody,
  WishlistVariantParams,
} from './wishlist.schemas.js';
import * as wishlistService from './wishlist.service.js';

export const listWishlist: RequestHandler = async (request, response) => {
  response.status(200).json({
    data: await wishlistService.getWishlist(request.auth!.user.id),
  });
};

export const addItem: RequestHandler = async (request, response) => {
  const { variantId } = validatedBody<AddWishlistItemBody>(request);
  response.status(201).json({
    data: await wishlistService.addItem(request.auth!.user.id, variantId),
  });
};

export const removeItem: RequestHandler = async (request, response) => {
  const { variantId } = validatedParams<WishlistVariantParams>(request);
  await wishlistService.removeItem(request.auth!.user.id, variantId);
  response.status(200).json({ message: 'Wishlist item removed' });
};
