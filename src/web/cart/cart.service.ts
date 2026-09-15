import { ProductStatus, Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';
import type {
  AddCartItemBody,
  CartOwner,
  UpdateCartItemBody,
} from './cart.schemas.js';
import * as cartRepository from './cart.repository.js';

const MAX_CART_QUANTITY = 999;

type CartRecord = NonNullable<Awaited<ReturnType<typeof cartRepository.findCart>>>;

function productImages(images: Prisma.JsonValue) {
  return Array.isArray(images)
    ? images.filter((image): image is string => typeof image === 'string')
    : [];
}

function cartResponse(cart: CartRecord | null) {
  const items =
    cart?.items.map((item) => {
      const lineTotal = item.variant.price.mul(item.qty);
      return {
        id: item.id,
        qty: item.qty,
        lineTotal: lineTotal.toFixed(2),
        variant: {
          id: item.variant.id,
          sku: item.variant.sku,
          size: item.variant.size,
          color: item.variant.color,
          price: item.variant.price.toFixed(2),
          stockQty: item.variant.stockQty,
          available:
            item.variant.product.status === ProductStatus.active &&
            item.variant.stockQty >= item.qty,
        },
        product: {
          id: item.variant.product.id,
          name: item.variant.product.name,
          slug: item.variant.product.slug,
          images: productImages(item.variant.product.images),
          category: item.variant.product.category,
        },
      };
    }) ?? [];

  const subtotal = items.reduce(
    (total, item) => total.plus(item.lineTotal),
    new Prisma.Decimal(0),
  );

  return {
    items,
    itemCount: items.reduce((count, item) => count + item.qty, 0),
    subtotal: subtotal.toFixed(2),
  };
}

async function requireSellableVariant(
  transaction: Prisma.TransactionClient,
  variantId: string,
  qty: number,
) {
  const variant = await cartRepository.findVariant(transaction, variantId);
  if (!variant || variant.product.status !== ProductStatus.active) {
    throw new AppError(404, 'VARIANT_NOT_SELLABLE', 'Variant is not available');
  }
  if (variant.stockQty < qty) {
    throw new AppError(
      409,
      'INSUFFICIENT_STOCK',
      'Requested quantity is not currently available',
    );
  }
  return variant;
}

export async function getCart(owner: CartOwner) {
  return cartResponse(await cartRepository.findCart(owner));
}

export async function addItem(owner: CartOwner, input: AddCartItemBody) {
  await cartRepository.runCartTransaction(async (transaction) => {
    const cart = await cartRepository.getOrCreateCart(transaction, owner);
    await cartRepository.lockCart(transaction, cart.id);
    const existing = await cartRepository.findCartVariantItem(
      transaction,
      cart.id,
      input.variantId,
    );
    const quantity = (existing?.qty ?? 0) + input.qty;
    if (quantity > MAX_CART_QUANTITY) {
      throw new AppError(
        422,
        'CART_QUANTITY_LIMIT',
        `A Cart item cannot exceed ${MAX_CART_QUANTITY}`,
      );
    }
    await requireSellableVariant(transaction, input.variantId, quantity);
    if (existing) {
      await cartRepository.updateCartItemQuantity(
        transaction,
        existing.id,
        quantity,
      );
    } else {
      await cartRepository.createCartItem(
        transaction,
        cart.id,
        input.variantId,
        input.qty,
      );
    }
  });
  return getCart(owner);
}

export async function updateItem(
  owner: CartOwner,
  itemId: string,
  input: UpdateCartItemBody,
) {
  await cartRepository.runCartTransaction(async (transaction) => {
    const cart = await cartRepository.getOrCreateCart(transaction, owner);
    await cartRepository.lockCart(transaction, cart.id);
    const item = await cartRepository.findCartItem(transaction, cart.id, itemId);
    if (!item) {
      throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item was not found');
    }
    await requireSellableVariant(transaction, item.variantId, input.qty);
    await cartRepository.updateCartItemQuantity(transaction, item.id, input.qty);
  });
  return getCart(owner);
}

export async function removeItem(owner: CartOwner, itemId: string) {
  await cartRepository.runCartTransaction(async (transaction) => {
    const cart = await cartRepository.getOrCreateCart(transaction, owner);
    await cartRepository.lockCart(transaction, cart.id);
    const item = await cartRepository.findCartItem(transaction, cart.id, itemId);
    if (!item) {
      throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item was not found');
    }
    await cartRepository.deleteCartItem(transaction, item.id);
  });
}

export async function clearCart(owner: CartOwner) {
  await cartRepository.runCartTransaction(async (transaction) => {
    const cart = await cartRepository.getOrCreateCart(transaction, owner);
    await cartRepository.lockCart(transaction, cart.id);
    await cartRepository.clearCartItems(transaction, cart.id);
  });
}

export async function mergeGuestCart(
  userId: string,
  guestSessionHash: string | undefined,
) {
  const userOwner = { userId } as const;
  if (!guestSessionHash) {
    return getCart(userOwner);
  }

  await cartRepository.runCartTransaction(async (transaction) => {
    const guestCart = await cartRepository.findCart(
      { sessionId: guestSessionHash },
      transaction,
    );
    if (!guestCart) {
      return;
    }

    const userCart = await cartRepository.getOrCreateCart(transaction, userOwner);
    for (const cartId of [guestCart.id, userCart.id].sort()) {
      await cartRepository.lockCart(transaction, cartId);
    }
    const currentUserCart = await cartRepository.findCart(userOwner, transaction);
    const existingByVariant = new Map(
      currentUserCart?.items.map((item) => [item.variantId, item]) ?? [],
    );

    for (const guestItem of guestCart.items) {
      const existing = existingByVariant.get(guestItem.variantId);
      const quantity = guestItem.qty + (existing?.qty ?? 0);
      if (quantity > MAX_CART_QUANTITY) {
        throw new AppError(
          422,
          'CART_QUANTITY_LIMIT',
          `Merged Cart quantity cannot exceed ${MAX_CART_QUANTITY}`,
        );
      }
      if (existing) {
        await cartRepository.updateCartItemQuantity(
          transaction,
          existing.id,
          quantity,
        );
      } else {
        await cartRepository.createCartItem(
          transaction,
          userCart.id,
          guestItem.variantId,
          guestItem.qty,
        );
      }
    }
    await cartRepository.deleteCart(transaction, guestCart.id);
  });

  return getCart(userOwner);
}
