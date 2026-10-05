import { randomUUID } from 'node:crypto';
import { EmailKind, MembershipAccrualSource, Prisma, type PosPaymentMethod } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { AppError } from '../../shared/errors/app-error.js';
import { paginatedResult } from '../../shared/http/pagination.js';
import { changeInventory } from '../../shared/inventory/inventory.service.js';
import {
  MAX_POS_ITEM_QUANTITY,
  MAX_POS_SALE_ITEMS,
} from './sales.constants.js';
import {
  createSaleWithItems,
  getByClientSaleId,
  getByClientSaleIdInTransaction,
  getById,
  getByStaffId,
  getStaffForSale,
  getVariantsForSale,
  lockOfflineSaleKey,
  lockSaleVariants,
  markSaleNeedsReview,
} from './sales.repository.js';
import type { ListSalesQuery } from './sales.schemas.js';
import { accrueMembership, membershipSnapshot, quoteMembership } from '../../shared/membership/membership.service.js';
import { computeMembershipDiscount } from '../../shared/membership/discount.js';
import { createEmailOutbox } from '../../shared/email/email.service.js';
import { posReceiptEmail } from '../../shared/email/email-templates.js';
import { logger } from '../../configs/logger.config.js';
import { resolvePosPayment, type SplitInput } from './payment-split.js';

export type CreateSaleInput = {
  items: {
    variantId: string;
    qty: number;
  }[];
  paymentMethod: PosPaymentMethod;
  split?: SplitInput | undefined;
  customerProfileId?: string;
  applyMembershipDiscount?: boolean;
  discountWaiverReason?: string | undefined;
};

export type CreateOfflineSaleInput = CreateSaleInput & {
  clientSaleId: string;
  occurredAt: Date;
};

type StoredSale = NonNullable<Awaited<ReturnType<typeof getByClientSaleId>>>;

type SaleCreationResult = {
  sale: StoredSale;
  replayed: boolean;
};

function validateSaleItems(items: CreateSaleInput['items']): void {
  if (items.length === 0 || items.length > MAX_POS_SALE_ITEMS) {
    throw new AppError(
      422,
      'INVALID_POS_SALE_SIZE',
      `A sale must contain between 1 and ${MAX_POS_SALE_ITEMS} items`,
    );
  }

  const variantIds = new Set<string>();

  for (const item of items) {
    if (
      !Number.isSafeInteger(item.qty) ||
      item.qty <= 0 ||
      item.qty > MAX_POS_ITEM_QUANTITY
    ) {
      throw new AppError(
        422,
        'INVALID_POS_SALE_QUANTITY',
        `Sale quantities must be integers between 1 and ${MAX_POS_ITEM_QUANTITY}`,
      );
    }

    if (variantIds.has(item.variantId)) {
      throw new AppError(
        422,
        'DUPLICATE_POS_SALE_VARIANT',
        'A variant may appear only once in a sale',
      );
    }

    variantIds.add(item.variantId);
  }
}

function generateSaleNumber(): string {
  return `SALE-${randomUUID().toUpperCase()}`;
}

function primaryProductImage(images: Prisma.JsonValue) {
  return Array.isArray(images) ? images.find((image): image is string => typeof image === 'string') ?? null : null;
}

function serializeSale(sale: StoredSale) {
  return {
    ...sale,
    subtotal: sale.subtotal.toFixed(2),
    merchandiseDiscount: sale.merchandiseDiscount.toFixed(2),
    membershipDiscountPercent: sale.membershipDiscountPercent.toFixed(2),
    membershipDiscountWaivedPercent: sale.membershipDiscountWaivedPercent.toFixed(2),
    membershipDiscountWaivedAmount: sale.membershipDiscountWaivedAmount.toFixed(2),
    total: sale.total.toFixed(2),
    cashAmount: sale.cashAmount.toFixed(2),
    qrAmount: sale.qrAmount.toFixed(2),
    items: sale.items.map((item) => ({
      ...item,
      price: item.price.toFixed(2),
      discountAmount: item.discountAmount.toFixed(2),
    })),
  };
}

function assertIdempotentReplayMatches(
  existing: StoredSale,
  input: CreateOfflineSaleInput,
): void {
  const quantitiesByVariantId = new Map(
    existing.items.map((item) => [item.variantId, item.qty]),
  );
  const matches =
    existing.paymentMethod === input.paymentMethod &&
    existing.createdAt.getTime() === input.occurredAt.getTime() &&
    existing.items.length === input.items.length &&
    input.items.every(
      (item) => quantitiesByVariantId.get(item.variantId) === item.qty,
    );

  if (!matches) {
    throw new AppError(
      409,
      'POS_OFFLINE_IDEMPOTENCY_CONFLICT',
      'clientSaleId was already used for a different offline sale',
    );
  }
}

export async function listSalesForStaff(
  staffId: string,
  query: ListSalesQuery,
) {
  const [sales, total] = await getByStaffId(staffId, query);
  return paginatedResult(
    sales.map((sale) => ({
      ...sale,
      subtotal: sale.subtotal.toFixed(2),
      total: sale.total.toFixed(2),
    })),
    total,
    query,
  );
}

export async function getSaleDetail(saleId: string, staffId: string) {
  const sale = await getById(saleId, staffId);

  if (!sale) {
    throw new AppError(404, 'POS_SALE_NOT_FOUND', 'Sale not found');
  }

  return serializeSale(sale);
}

async function createSaleWithInventoryPolicy(
  staffId: string,
  input: CreateSaleInput | CreateOfflineSaleInput,
  allowNegativeStock: boolean,
): Promise<SaleCreationResult> {
  validateSaleItems(input.items);

  const offlineInput = 'clientSaleId' in input ? input : undefined;
  const clientSaleId = offlineInput?.clientSaleId;
  if (offlineInput) {
    const existing = await getByClientSaleId(staffId, offlineInput.clientSaleId);
    if (existing) {
      assertIdempotentReplayMatches(existing, offlineInput);
      return { sale: existing, replayed: true };
    }
  }

  const saleNumber = generateSaleNumber();

  try {
    return await prisma.$transaction(async (transaction) => {
      if (offlineInput) {
        await lockOfflineSaleKey(
          transaction,
          staffId,
          offlineInput.clientSaleId,
        );
        const existing = await getByClientSaleIdInTransaction(
          transaction,
          staffId,
          offlineInput.clientSaleId,
        );
        if (existing) {
          assertIdempotentReplayMatches(existing, offlineInput);
          return { sale: existing, replayed: true };
        }
      }

      const staff = await getStaffForSale(transaction, staffId);
      if (!staff) {
        throw new AppError(
          403,
          'POS_STAFF_NOT_ALLOWED',
          'The authenticated account cannot create POS sales',
        );
      }

      const variantIds = input.items.map((item) => item.variantId);
      const lockOrderedVariantIds = [...variantIds].sort((left, right) =>
        left.localeCompare(right),
      );
      const lockedVariants = await lockSaleVariants(transaction, lockOrderedVariantIds);
      const variants = await getVariantsForSale(transaction, variantIds);

      if (variants.length !== variantIds.length) {
        throw new AppError(
          404,
          'POS_SALE_VARIANT_NOT_FOUND',
          'One or more active sale variants were not found',
        );
      }

      const variantById = new Map(
        variants.map((variant) => [variant.id, variant]),
      );
      const stockByVariantId = new Map(lockedVariants.map((variant) => [variant.id, variant.stockQty]));
      if (!allowNegativeStock) {
        for (const item of input.items) {
          const stockQty = stockByVariantId.get(item.variantId);
          const variant = variantById.get(item.variantId);
          if (stockQty !== undefined && stockQty < item.qty) {
            throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${stockQty} units of ${variant?.sku ?? 'this variant'} remain.`);
          }
        }
      }

      const customer = input.customerProfileId
        ? await transaction.customerProfile.findFirst({ where: { id: input.customerProfileId, state: 'active', normalizedPhone: { not: null }, normalizedEmail: { not: null }, birthDate: { not: null }, preferredCalendar: { not: null } } })
        : null;
      if (!offlineInput && !customer) {
        throw new AppError(422, 'POS_CUSTOMER_REQUIRED', 'Select or create a customer before completing this sale');
      }
      const membership = customer ? await quoteMembership(transaction, customer.id, offlineInput?.occurredAt ?? new Date()) : null;

      const saleLines = input.items.map((item) => {
        const variant = variantById.get(item.variantId);

        if (!variant) {
          throw new AppError(
            404,
            'POS_SALE_VARIANT_NOT_FOUND',
            'One or more active sale variants were not found',
          );
        }

        return {
          variantId: item.variantId,
          productName: variant.product.name,
          productImageUrl: variant.product.media[0]?.publicUrl ?? primaryProductImage(variant.product.images),
          variantSku: variant.sku,
          variantSize: variant.size,
          variantColor: variant.color,
          qty: item.qty,
          price: variant.price,
          membershipDiscountEligible: variant.product.membershipDiscountEligible,
        };
      });

      // The discount the customer is entitled to on this ticket: the tier
      // percentage applied only to products an administrator left eligible.
      const zero = new Prisma.Decimal(0);
      const discountLines = saleLines.map((line) => ({ price: line.price, qty: line.qty, eligible: line.membershipDiscountEligible }));
      const entitledPercent = membership?.discountPercent ?? zero;
      const entitled = computeMembershipDiscount(discountLines, entitledPercent);
      // A cashier can withhold that discount, never add one. It only counts as
      // a waiver when there was a real discount to withhold.
      const discountWaived = input.applyMembershipDiscount === false && entitled.discount.gt(0);
      const applied = discountWaived ? computeMembershipDiscount(discountLines, zero) : entitled;
      const appliedPercent = discountWaived || applied.discount.isZero() ? zero : entitledPercent;
      const saleItems = saleLines.map((line, index) => ({ ...line, discountAmount: applied.lineDiscounts[index] ?? zero }));
      const subtotal = applied.subtotal;
      const merchandiseDiscount = applied.discount;
      const total = subtotal.minus(merchandiseDiscount);

      // Offline sales already happened, so a split that does not add up is
      // corrected and flagged instead of being refused.
      const payment = resolvePosPayment(input.paymentMethod, total, input.split, { lenient: Boolean(offlineInput) });

      const tierSnapshot = membership?.tier ? membershipSnapshot(membership.tier) : null;
      const createdSale = await createSaleWithItems(transaction, {
        staffId,
        ...(customer ? { customerProfileId: customer.id } : {}),
        ...(clientSaleId ? { clientSaleId } : {}),
        cashierName: staff.name,
        ...(offlineInput ? { occurredAt: offlineInput.occurredAt } : {}),
        saleNumber,
        paymentMethod: input.paymentMethod,
        cashAmount: payment.cashAmount,
        qrAmount: payment.qrAmount,
        subtotal,
        merchandiseDiscount,
        membershipDiscountPercent: appliedPercent,
        ...(tierSnapshot ? { membershipTierSnapshot: tierSnapshot } : {}),
        membershipDiscountWaived: discountWaived,
        membershipDiscountWaivedPercent: discountWaived ? entitledPercent : zero,
        membershipDiscountWaivedAmount: discountWaived ? entitled.discount : zero,
        ...(discountWaived && input.discountWaiverReason ? { membershipDiscountWaivedReason: input.discountWaiverReason } : {}),
        total,
        items: saleItems,
      });

      const inventoryItems = [...saleItems].sort((left, right) =>
        left.variantId.localeCompare(right.variantId),
      );

      let needsReview = payment.adjusted;

      for (const item of inventoryItems) {
        const inventoryResult = await changeInventory({
          transaction,
          variantId: item.variantId,
          changeQty: -item.qty,
          reason: 'pos_sale',
          source: 'pos',
          referenceId: createdSale.id,
          allowNegative: allowNegativeStock,
        });

        if (inventoryResult.stockQty < 0) needsReview = true;
      }

      if (needsReview) {
        await markSaleNeedsReview(transaction, createdSale.id);
      }

      if (input.paymentMethod === 'split') {
        logger.info('POS sale paid by split payment', {
          saleId: createdSale.id,
          saleNumber: createdSale.saleNumber,
          staffId,
          total: total.toFixed(2),
          cashAmount: payment.cashAmount.toFixed(2),
          qrAmount: payment.qrAmount.toFixed(2),
          adjusted: payment.adjusted,
        });
      }

      if (discountWaived) {
        // Durable record lives on the sale row; this line makes it searchable
        // in the application log as well.
        logger.info('POS membership discount withheld by staff', {
          saleId: createdSale.id,
          saleNumber: createdSale.saleNumber,
          staffId,
          customerProfileId: customer?.id,
          withheldPercent: entitledPercent.toFixed(2),
          withheldAmount: entitled.discount.toFixed(2),
          reason: input.discountWaiverReason,
        });
      }

      if (customer) {
        const accrual = await accrueMembership({ transaction, customerProfileId: customer.id, source: MembershipAccrualSource.pos_sale, posSaleId: createdSale.id, netMerchandiseAmount: total, now: offlineInput?.occurredAt ?? new Date() });
        const email = posReceiptEmail({
          customerName: customer.fullName,
          saleNumber: createdSale.saleNumber,
          createdAt: createdSale.createdAt,
          cashierName: staff.name,
          paymentMethod: input.paymentMethod,
          cashAmount: payment.cashAmount,
          qrAmount: payment.qrAmount,
          items: saleItems.map((item) => ({ ...item, lineTotal: item.price.mul(item.qty) })),
          subtotal,
          merchandiseDiscount,
          membershipDiscountPercent: appliedPercent,
          tierName: membership?.tier?.name ?? null,
          discountWaived,
          total,
          eligibleNetSpend: accrual.membership.eligibleNetSpend,
          newlyUnlockedTier: accrual.newlyUnlocked?.name ?? null,
        });
        await createEmailOutbox({
          kind: EmailKind.pos_receipt,
          recipientEmail: customer.normalizedEmail!,
          deduplicationKey: `pos-receipt:${createdSale.id}`,
          payload: email,
        }, transaction);
      }

      return {
        sale: { ...createdSale, needsReview },
        replayed: false,
      };
    });
  } catch (error) {
    if (
      clientSaleId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await getByClientSaleId(staffId, clientSaleId);
      if (existing && offlineInput) {
        assertIdempotentReplayMatches(existing, offlineInput);
        return { sale: existing, replayed: true };
      }
    }

    throw error;
  }
}

export async function createSale(staffId: string, input: CreateSaleInput) {
  const result = await createSaleWithInventoryPolicy(staffId, input, false);
  return serializeSale(result.sale);
}

export async function createOfflineSale(
  staffId: string,
  input: CreateOfflineSaleInput,
) {
  const result = await createSaleWithInventoryPolicy(staffId, input, true);

  return {
    sale: serializeSale(result.sale),
    needsReview: result.sale.needsReview,
    replayed: result.replayed,
  };
}
