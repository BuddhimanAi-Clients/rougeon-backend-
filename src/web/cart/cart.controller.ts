import type { RequestHandler } from 'express';
import { websiteOwner } from '../../shared/guest-session/guest-session.middleware.js';
import {
  validatedBody,
  validatedParams,
} from '../../shared/validation/validation.middleware.js';
import type {
  AddCartItemBody,
  CartItemParams,
  UpdateCartItemBody,
} from './cart.schemas.js';
import * as cartService from './cart.service.js';

export const getCart: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await cartService.getCart(websiteOwner(request)) });
};

export const addItem: RequestHandler = async (request, response) => {
  response.status(201).json({
    data: await cartService.addItem(
      websiteOwner(request),
      validatedBody<AddCartItemBody>(request),
    ),
  });
};

export const updateItem: RequestHandler = async (request, response) => {
  const { itemId } = validatedParams<CartItemParams>(request);
  response.status(200).json({
    data: await cartService.updateItem(
      websiteOwner(request),
      itemId,
      validatedBody<UpdateCartItemBody>(request),
    ),
  });
};

export const removeItem: RequestHandler = async (request, response) => {
  const { itemId } = validatedParams<CartItemParams>(request);
  await cartService.removeItem(websiteOwner(request), itemId);
  response.status(200).json({ message: 'Cart item removed' });
};

export const clearCart: RequestHandler = async (request, response) => {
  await cartService.clearCart(websiteOwner(request));
  response.status(200).json({ message: 'Cart cleared' });
};

export const mergeCart: RequestHandler = async (request, response) => {
  response.status(200).json({
    data: await cartService.mergeGuestCart(
      request.auth!.user.id,
      request.websiteContext?.guestSessionHash,
    ),
  });
};
