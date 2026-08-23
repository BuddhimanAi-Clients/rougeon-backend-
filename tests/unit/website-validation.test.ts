import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { publicProductListQuerySchema } from '../../src/shared/products/product.schemas.js';
import { createAddressBodySchema } from '../../src/web/addresses/address.schemas.js';
import { addCartItemBodySchema } from '../../src/web/cart/cart.schemas.js';
import { checkoutBodySchema } from '../../src/web/checkout/checkout.schemas.js';

describe('Website request schemas', () => {
  test('Product filters reject invalid price ranges and conflicting categories', () => {
    assert.equal(
      publicProductListQuerySchema.safeParse({ minPrice: '20', maxPrice: '10' }).success,
      false,
    );
    assert.equal(
      publicProductListQuerySchema.safeParse({ categoryId: 'one', categorySlug: 'two' }).success,
      false,
    );
    assert.equal(
      publicProductListQuerySchema.safeParse({ sort: 'unsafe_sort' }).success,
      false,
    );
  });

  test('Cart quantities must be positive bounded integers', () => {
    for (const qty of [0, -1, 1.5, 1_000]) {
      assert.equal(
        addCartItemBodySchema.safeParse({ variantId: 'variant-1', qty }).success,
        false,
      );
    }
  });

  test('checkout accepts exactly one documented request shape', () => {
    assert.equal(
      checkoutBodySchema.safeParse({ shippingAddressId: 'address-1' }).success,
      true,
    );
    assert.equal(
      checkoutBodySchema.safeParse({
        guest: {
          name: 'Guest',
          phone: '9800000000',
          fullAddress: 'Guest address',
          city: 'Itahari',
        },
      }).success,
      true,
    );
    assert.equal(checkoutBodySchema.safeParse({}).success, false);
    assert.equal(
      checkoutBodySchema.safeParse({ shippingAddressId: 'address-1', total: '1.00' }).success,
      false,
    );
  });

  test('new Addresses validate required delivery fields', () => {
    assert.equal(
      createAddressBodySchema.safeParse({
        label: 'Home',
        fullAddress: 'Itahari main road',
        city: 'Itahari',
        phone: '9800000000',
      }).success,
      true,
    );
    assert.equal(
      createAddressBodySchema.safeParse({ label: 'Home', city: 'Itahari' }).success,
      false,
    );
  });
});
