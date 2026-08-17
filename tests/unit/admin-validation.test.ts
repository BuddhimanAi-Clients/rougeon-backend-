import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createStaffBodySchema } from '../../src/admin/staffs/staff.schemas.js';
import { updateCategoryBodySchema } from '../../src/admin/categories/category.schemas.js';
import { dashboardSalesQuerySchema } from '../../src/admin/dashboards/dashboard.schemas.js';
import { createVariantBodySchema } from '../../src/admin/variants/variant.schemas.js';

describe('Admin request schemas', () => {
  test('staff roles accept only cashier and admin', () => {
    assert.equal(
      createStaffBodySchema.safeParse({
        name: 'Customer',
        email: 'customer@example.com',
        password: 'Password123!',
        role: 'customer',
      }).success,
      false,
    );
  });

  test('category update rejects an empty body', () => {
    assert.equal(updateCategoryBodySchema.safeParse({}).success, false);
  });

  test('variant price rejects excess decimal places', () => {
    assert.equal(
      createVariantBodySchema.safeParse({
        sku: 'SKU-1',
        size: 'M',
        color: 'Black',
        price: '10.999',
        initialStock: 0,
      }).success,
      false,
    );
  });

  test('dashboard rejects conflicting date modes', () => {
    assert.equal(
      dashboardSalesQuerySchema.safeParse({ range: 'today', date: '2026-08-17' }).success,
      false,
    );
    assert.equal(
      dashboardSalesQuerySchema.safeParse({ from: '2026-08-01' }).success,
      false,
    );
  });
});
