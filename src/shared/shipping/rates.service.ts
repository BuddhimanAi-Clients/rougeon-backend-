import { Prisma } from '@prisma/client';
import { envVariables } from '../../configs/env.config.js';
import { AppError } from '../errors/app-error.js';
import { DEFAULT_DELIVERY_TYPE, type DeliveryType } from './delivery-types.js';

// Nepal Can Move publishes its branch list and rate calculator without a
// token, so quoting works even before the vendor token is configured.
const DEFAULT_BASE_URL = 'https://portal.nepalcanmove.com';
const DEFAULT_PICKUP_BRANCH = 'CHABAHIL';
const BRANCH_TTL_MS = 12 * 60 * 60 * 1000;
const RATE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

// NCM's rate calculator names the same two services differently.
const RATE_TYPE: Record<DeliveryType, string> = {
  Door2Door: 'Pickup/Collect',
  Door2Branch: 'D2B',
};

export type DeliveryBranch = {
  name: string;
  district: string | null;
  province: string | null;
  areas: string | null;
};

export type DeliveryQuote = {
  branch: string | null;
  deliveryType: DeliveryType;
  // What the courier charges for the parcel.
  deliveryFee: Prisma.Decimal;
  // ROGUEON's own collection charge. Never itemised for customers.
  pickupFee: Prisma.Decimal;
  // The single Delivery amount customers see and pay.
  total: Prisma.Decimal;
};

let branchCache: { at: number; branches: DeliveryBranch[] } | null = null;
let branchRequest: Promise<DeliveryBranch[]> | null = null;
const rateCache = new Map<string, { at: number; charge: string }>();

export function pickupBranch() {
  return envVariables.NCM_DEFAULT_PICKUP_BRANCH ?? DEFAULT_PICKUP_BRANCH;
}

function unavailable() {
  return new AppError(
    503,
    'SHIPPING_RATE_UNAVAILABLE',
    'We could not calculate delivery right now. Please try again in a moment.',
  );
}

async function ncmJson(path: string, query?: Record<string, string>) {
  const url = new URL(path, envVariables.NCM_API_BASE_URL ?? DEFAULT_BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`NCM responded ${response.status}`);
  return (await response.json()) as unknown;
}

function text(value: unknown) {
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string').join(', ').trim() || null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseBranches(payload: unknown): DeliveryBranch[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];
  const seen = new Set<string>();
  const branches: DeliveryBranch[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const name = text(record.name);
    if (!name || seen.has(name.toUpperCase())) continue;
    seen.add(name.toUpperCase());
    branches.push({
      name,
      district: text(record.district_name),
      province: text(record.province_name),
      areas: text(record.areas_covered),
    });
  }
  return branches.sort((a, b) => a.name.localeCompare(b.name));
}

export function parseCharge(payload: unknown) {
  const raw = payload && typeof payload === 'object' ? (payload as { charge?: unknown }).charge : undefined;
  const value = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0) return null;
  return value;
}

export async function listBranches(): Promise<DeliveryBranch[]> {
  if (branchCache && Date.now() - branchCache.at < BRANCH_TTL_MS) return branchCache.branches;
  branchRequest ??= ncmJson('/api/v2/branches')
    .then((payload) => {
      const branches = parseBranches(payload);
      if (branches.length === 0) throw new Error('NCM returned no branches');
      branchCache = { at: Date.now(), branches };
      return branches;
    })
    .finally(() => { branchRequest = null; });
  try {
    return await branchRequest;
  } catch {
    // A stale list is far better than blocking checkout on a courier hiccup.
    if (branchCache) return branchCache.branches;
    throw unavailable();
  }
}

/** Returns NCM's own spelling of the branch, or rejects an unknown one. */
export async function resolveBranch(name: string) {
  const wanted = name.trim().toUpperCase();
  const match = (await listBranches()).find((branch) => branch.name.toUpperCase() === wanted);
  if (!match) {
    throw new AppError(422, 'DELIVERY_AREA_INVALID', 'Choose a delivery area from the list');
  }
  return match.name;
}

/** Validates a customer-chosen delivery area for storage on an address. */
export async function normalizeBranch(name: string | null | undefined) {
  if (!name) return null;
  if (envVariables.SHIPPING_RATE_MODE === 'flat') return name.trim();
  return resolveBranch(name);
}

async function ncmCharge(destination: string, deliveryType: DeliveryType) {
  const origin = pickupBranch();
  const key = `${origin}>${destination}>${deliveryType}`.toUpperCase();
  const cached = rateCache.get(key);
  if (cached && Date.now() - cached.at < RATE_TTL_MS) return cached.charge;
  try {
    const charge = parseCharge(
      await ncmJson('/api/v1/shipping-rate', { creation: origin, destination, type: RATE_TYPE[deliveryType] }),
    );
    if (!charge) throw new Error('NCM returned no charge');
    rateCache.set(key, { at: Date.now(), charge });
    return charge;
  } catch {
    if (cached) return cached.charge;
    throw unavailable();
  }
}

export async function quoteDelivery(
  branch: string | null | undefined,
  deliveryType: DeliveryType = DEFAULT_DELIVERY_TYPE,
): Promise<DeliveryQuote> {
  const pickupFee = new Prisma.Decimal(envVariables.NCM_PICKUP_FEE);
  if (envVariables.SHIPPING_RATE_MODE === 'flat') {
    // One fixed fee has no cheaper branch option, so it is always home delivery.
    const deliveryFee = new Prisma.Decimal(envVariables.SHIPPING_FEE);
    return { branch: branch?.trim() || null, deliveryType: DEFAULT_DELIVERY_TYPE, deliveryFee, pickupFee, total: deliveryFee.plus(pickupFee) };
  }
  if (!branch?.trim()) {
    throw new AppError(422, 'DELIVERY_AREA_REQUIRED', 'Choose your delivery area to continue');
  }
  const resolved = await resolveBranch(branch);
  const deliveryFee = new Prisma.Decimal(await ncmCharge(resolved, deliveryType));
  return { branch: resolved, deliveryType, deliveryFee, pickupFee, total: deliveryFee.plus(pickupFee) };
}

/**
 * Every way the customer can receive the parcel in this area, home delivery
 * first. Branch collection is simply left out when the courier has no rate
 * for it, so checkout never stalls on the optional choice.
 */
export async function quoteDeliveryOptions(branch: string | null | undefined): Promise<DeliveryQuote[]> {
  const home = await quoteDelivery(branch, 'Door2Door');
  if (envVariables.SHIPPING_RATE_MODE === 'flat') return [home];
  try {
    return [home, await quoteDelivery(home.branch, 'Door2Branch')];
  } catch {
    return [home];
  }
}
