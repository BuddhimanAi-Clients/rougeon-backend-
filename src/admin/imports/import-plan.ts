import {
  buildSku,
  firstFree,
  isStandardSize,
  nameKey,
  nearMatch,
  normalizeColour,
  normalizeName,
  normalizeSize,
  slugify,
} from '../../shared/catalog/catalog-text.js';

// Works out what a bulk import would do, without touching the database. The
// same plan drives the "check" report and the real import, so what an admin
// approves is exactly what gets saved.

export const MAX_PRODUCT_PHOTOS = 20;

export type ImportRowInput = {
  row: number;
  category?: string | undefined;
  parentCategory?: string | undefined;
  productName?: string | undefined;
  description?: string | undefined;
  colour?: string | undefined;
  size?: string | undefined;
  price?: string | number | undefined;
  stock?: string | number | undefined;
  status?: string | undefined;
  memberDiscount?: string | undefined;
  sku?: string | undefined;
};

export type ImportPhotoInput = { path: string; product: string; colour?: string | null | undefined; file: string };

export type ExistingCatalog = {
  categories: Array<{ id: string; name: string; slug: string }>;
  products: Array<{
    id: string;
    name: string;
    slug: string;
    variants: Array<{ id: string; sku: string; size: string; color: string }>;
    media: Array<{ color: string | null; sourceName: string | null }>;
  }>;
  skus: string[];
  colours: string[];
};

export type ImportIssue = { row: number | null; field: string; message: string };
export type ImportSuggestion = { key: string; kind: 'category' | 'product' | 'colour'; value: string; suggestion: string; rows: number[] };

export type PlannedVariant = {
  row: number;
  existingId: string | null;
  sku: string;
  size: string;
  colour: string;
  price: string;
  stock: number;
};
export type PlannedPhoto = { path: string; colour: string | null; file: string; alreadyImported: boolean };
export type PlannedProduct = {
  name: string;
  existingId: string | null;
  slug: string;
  categoryName: string;
  description: string;
  status: 'draft' | 'active';
  membershipDiscountEligible: boolean;
  variants: PlannedVariant[];
  photos: PlannedPhoto[];
};
export type PlannedCategory = { name: string; existingId: string | null; slug: string; parentName: string | null };

export type ImportPlan = {
  categories: PlannedCategory[];
  products: PlannedProduct[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  suggestions: ImportSuggestion[];
  summary: {
    rows: number;
    categories: { new: number; existing: number };
    products: { new: number; existing: number };
    variants: { new: number; existing: number };
    photos: { toUpload: number; alreadyImported: number; notAttached: number };
  };
};

// Catalogue photos must be PNG. Other picture formats are an error the
// admin must fix; files that are not pictures at all are simply skipped.
const PNG_FILE = /\.png$/i;
const OTHER_PICTURE = /\.(jpe?g|webp|gif|bmp|tiff?|heic|heif|avif|svg)$/i;
const MONEY = /^\d{1,10}(?:\.\d{1,2})?$/;

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

type Tally = Map<string, { value: string; rows: number[] }>;

function tally(target: Tally, value: string, row: number) {
  const key = nameKey(value);
  const entry = target.get(key);
  if (entry) entry.rows.push(row);
  else target.set(key, { value, rows: [row] });
}

/**
 * Suggests the likely intended value for names that are new to the store and
 * look like a typo of an existing name, or of a more common name in the file.
 */
function suggest(
  kind: ImportSuggestion['kind'],
  values: Tally,
  existing: string[],
  confirmedNew: Set<string>,
): ImportSuggestion[] {
  const existingKeys = new Set(existing.map(nameKey));
  const suggestions: ImportSuggestion[] = [];
  for (const [key, entry] of values) {
    if (existingKeys.has(key)) continue;
    const suggestionKey = `${kind}:${key}`;
    if (confirmedNew.has(suggestionKey)) continue;
    const stronger = [...values.values()]
      .filter((other) => nameKey(other.value) !== key && (other.rows.length > entry.rows.length || (other.rows.length === entry.rows.length && other.rows[0]! < entry.rows[0]!)))
      .map((other) => other.value);
    const match = nearMatch(entry.value, [...existing, ...stronger]);
    if (match) suggestions.push({ key: suggestionKey, kind, value: entry.value, suggestion: match, rows: entry.rows });
  }
  return suggestions;
}

export function planImport(
  rowsInput: ImportRowInput[],
  photosInput: ImportPhotoInput[],
  existing: ExistingCatalog,
  confirmedNewInput: string[] = [],
): ImportPlan {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const confirmedNew = new Set(confirmedNewInput.map((value) => value.toLowerCase()));

  const existingCategoryByKey = new Map(existing.categories.map((category) => [nameKey(category.name), category]));
  const existingProductByKey = new Map(existing.products.map((product) => [nameKey(product.name), product]));
  const takenCategorySlugs = new Set(existing.categories.map((category) => category.slug));
  const takenProductSlugs = new Set(existing.products.map((product) => product.slug));
  const takenSkus = new Set(existing.skus.map((sku) => sku.toUpperCase()));

  type CleanRow = {
    row: number; category: string; parentCategory: string; productName: string; description: string;
    colour: string; size: string; price: string; stock: number; status: 'draft' | 'active' | null;
    memberDiscount: boolean | null; sku: string;
  };
  const clean: CleanRow[] = [];
  const categoryNames: Tally = new Map();
  const productNames: Tally = new Map();
  const colourNames: Tally = new Map();

  for (const input of rowsInput) {
    const row = input.row;
    const category = normalizeName(text(input.category));
    const productName = normalizeName(text(input.productName));
    const rawColour = text(input.colour);
    const rawSize = text(input.size);
    const rawPrice = text(input.price).replace(/,/g, '');
    const rawStock = text(input.stock).replace(/,/g, '');
    let valid = true;
    const fail = (field: string, message: string) => { errors.push({ row, field, message }); valid = false; };

    if (!category) fail('Category', 'Category is missing');
    if (!productName) fail('Product name', 'Product name is missing');
    if (!rawColour) fail('Colour', 'Colour is missing');
    if (!rawSize) fail('Size', 'Size is missing');
    if (!rawPrice) fail('Price', 'Price is missing');
    else if (!MONEY.test(rawPrice) || Number(rawPrice) <= 0) fail('Price', `Price "${rawPrice}" must be a number above zero, for example 4500`);
    const stock = rawStock === '' ? 0 : Number(rawStock);
    if (rawStock === '') fail('Stock', 'Stock is missing (use 0 if there is none yet)');
    else if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) fail('Stock', `Stock "${rawStock}" must be a whole number, 0 or more`);

    const rawStatus = text(input.status).toLowerCase();
    let status: CleanRow['status'] = null;
    if (rawStatus === 'active' || rawStatus === 'draft') status = rawStatus;
    else if (rawStatus) fail('Status', `Status "${rawStatus}" must be draft or active`);

    const rawDiscount = text(input.memberDiscount).toLowerCase();
    let memberDiscount: boolean | null = null;
    if (['yes', 'y', 'true', '1'].includes(rawDiscount)) memberDiscount = true;
    else if (['no', 'n', 'false', '0'].includes(rawDiscount)) memberDiscount = false;
    else if (rawDiscount) fail('Member discount', `Member discount "${rawDiscount}" must be yes or no`);

    const size = rawSize ? normalizeSize(rawSize) : '';
    const colour = rawColour ? normalizeColour(rawColour) : '';
    if (size && !isStandardSize(size)) {
      warnings.push({ row, field: 'Size', message: `Size "${size}" is not on the standard list. It will be saved as written.` });
    }
    const sku = text(input.sku).toUpperCase();
    if (sku.length > 100) fail('SKU', 'SKU is too long (100 characters at most)');
    if (productName.length > 180) fail('Product name', 'Product name is too long (180 characters at most)');
    if (category.length > 120) fail('Category', 'Category is too long (120 characters at most)');

    if (category) tally(categoryNames, category, row);
    const parentCategory = normalizeName(text(input.parentCategory));
    if (parentCategory) tally(categoryNames, parentCategory, row);
    if (productName) tally(productNames, productName, row);
    if (colour) tally(colourNames, colour, row);

    if (valid) {
      clean.push({ row, category, parentCategory, productName, description: text(input.description), colour, size, price: Number(rawPrice).toFixed(2), stock, status, memberDiscount, sku });
    }
  }

  const suggestions = [
    ...suggest('category', categoryNames, existing.categories.map((category) => category.name), confirmedNew),
    ...suggest('product', productNames, existing.products.map((product) => product.name), confirmedNew),
    ...suggest('colour', colourNames, existing.colours, confirmedNew),
  ];

  // Categories: reuse by name, create the rest. A parent is created top-level.
  const plannedCategories = new Map<string, PlannedCategory>();
  const ensureCategory = (name: string, parentName: string | null, row: number) => {
    const key = nameKey(name);
    const known = plannedCategories.get(key);
    if (known) return known;
    const found = existingCategoryByKey.get(key);
    let slug = found?.slug ?? '';
    if (!found) {
      const base = slugify(name);
      if (!base) errors.push({ row, field: 'Category', message: `Category "${name}" needs letters or numbers so a web address can be created` });
      else { slug = firstFree(base, (candidate) => takenCategorySlugs.has(candidate)); takenCategorySlugs.add(slug); }
    }
    const planned: PlannedCategory = { name: found?.name ?? name, existingId: found?.id ?? null, slug, parentName: found ? null : parentName };
    plannedCategories.set(key, planned);
    return planned;
  };

  const groups = new Map<string, CleanRow[]>();
  for (const row of clean) {
    const key = nameKey(row.productName);
    const group = groups.get(key);
    if (group) group.push(row); else groups.set(key, [row]);
  }

  const products: PlannedProduct[] = [];
  const fileSkus = new Set<string>();
  for (const rows of groups.values()) {
    const first = rows[0]!;
    const found = existingProductByKey.get(nameKey(first.productName));
    const mixedCategory = rows.find((row) => nameKey(row.category) !== nameKey(first.category));
    if (mixedCategory) {
      errors.push({ row: mixedCategory.row, field: 'Category', message: `"${first.productName}" is listed under "${first.category}" on row ${first.row} and "${mixedCategory.category}" here. A product can be in one category only.` });
    }
    if (first.parentCategory && nameKey(first.parentCategory) === nameKey(first.category)) {
      errors.push({ row: first.row, field: 'Parent category', message: 'A category cannot be its own parent' });
    } else if (first.parentCategory) {
      ensureCategory(first.parentCategory, null, first.row);
    }
    const category = ensureCategory(first.category, first.parentCategory || null, first.row);

    const description = rows.find((row) => row.description)?.description ?? '';
    if (!found && !description) {
      errors.push({ row: first.row, field: 'Description', message: `"${first.productName}" is a new product and needs a description on at least one of its rows` });
    }
    let slug = found?.slug ?? '';
    if (!found) {
      const base = slugify(first.productName);
      if (!base) errors.push({ row: first.row, field: 'Product name', message: `"${first.productName}" needs letters or numbers so a web address can be created` });
      else { slug = firstFree(base, (candidate) => takenProductSlugs.has(candidate)); takenProductSlugs.add(slug); }
    }

    const existingVariantByKey = new Map((found?.variants ?? []).map((variant) => [`${nameKey(variant.color)}|${nameKey(variant.size)}`, variant]));
    const seen = new Map<string, number>();
    const variants: PlannedVariant[] = [];
    for (const row of rows) {
      const key = `${nameKey(row.colour)}|${nameKey(row.size)}`;
      const earlier = seen.get(key);
      if (earlier !== undefined) {
        errors.push({ row: row.row, field: 'Size', message: `"${first.productName}" already has ${row.colour} / ${row.size} on row ${earlier}` });
        continue;
      }
      seen.set(key, row.row);
      const existingVariant = existingVariantByKey.get(key);
      let sku = existingVariant?.sku ?? row.sku;
      if (!existingVariant) {
        if (sku) {
          if (takenSkus.has(sku) || fileSkus.has(sku)) {
            errors.push({ row: row.row, field: 'SKU', message: `SKU "${sku}" is already used. Leave the SKU empty to have one created.` });
            continue;
          }
        } else {
          sku = firstFree(buildSku(first.productName, row.colour, row.size), (candidate) => takenSkus.has(candidate) || fileSkus.has(candidate));
        }
        fileSkus.add(sku);
      }
      variants.push({ row: row.row, existingId: existingVariant?.id ?? null, sku, size: row.size, colour: existingVariant?.color ?? row.colour, price: row.price, stock: row.stock });
    }

    products.push({
      name: found?.name ?? first.productName,
      existingId: found?.id ?? null,
      slug,
      categoryName: category.name,
      description,
      status: rows.find((row) => row.status)?.status ?? 'draft',
      membershipDiscountEligible: rows.find((row) => row.memberDiscount !== null)?.memberDiscount ?? true,
      variants,
      photos: [],
    });
  }

  // Photos: the folder is the product, the sub-folder is the colour.
  const productByKey = new Map(products.map((product) => [nameKey(product.name), product]));
  let notAttached = 0;
  const reported = new Set<string>();
  const once = (key: string, issue: ImportIssue) => { if (!reported.has(key)) { reported.add(key); warnings.push(issue); } };
  for (const photo of photosInput) {
    if (!PNG_FILE.test(photo.file)) {
      notAttached += 1;
      if (OTHER_PICTURE.test(photo.file)) {
        errors.push({ row: null, field: 'Photos', message: `"${photo.path}" is not a PNG. Photos must be PNG: save or export it as PNG and replace this file.` });
      } else {
        once(`type:${photo.path}`, { row: null, field: 'Photos', message: `"${photo.path}" is not a photo and will be skipped` });
      }
      continue;
    }
    const folder = normalizeName(photo.product);
    let product = productByKey.get(nameKey(folder));
    if (!product) {
      const near = nearMatch(folder, products.map((item) => item.name));
      product = near ? productByKey.get(nameKey(near)) : undefined;
      if (product) once(`folder:${folder}`, { row: null, field: 'Photos', message: `Photo folder "${folder}" was matched to the product "${product.name}"` });
    }
    if (!product) {
      notAttached += 1;
      once(`folder:${folder}`, { row: null, field: 'Photos', message: `Photo folder "${folder}" does not match any product in the file, so its photos will not be attached` });
      continue;
    }
    let colour: string | null = null;
    const rawColour = text(photo.colour);
    if (rawColour) {
      const wanted = normalizeColour(rawColour);
      const colours = [...new Set(product.variants.map((variant) => variant.colour))];
      const exact = colours.find((item) => nameKey(item) === nameKey(wanted));
      const near = exact ?? nearMatch(wanted, colours);
      if (!near) {
        notAttached += 1;
        once(`colour:${product.name}:${wanted}`, { row: null, field: 'Photos', message: `"${product.name}" has no ${wanted} variant in the file, so the photos in its "${rawColour}" folder will not be attached` });
        continue;
      }
      if (!exact) once(`colour:${product.name}:${wanted}`, { row: null, field: 'Photos', message: `Photo folder "${rawColour}" of "${product.name}" was matched to the colour ${near}` });
      colour = near;
    }
    const stored = existingProductByKey.get(nameKey(product.name));
    const alreadyImported = Boolean(stored?.media.some((image) => (image.color ?? null) === colour && image.sourceName === photo.file));
    product.photos.push({ path: photo.path, colour, file: photo.file, alreadyImported });
  }

  for (const product of products) {
    const stored = existingProductByKey.get(nameKey(product.name));
    const fresh = product.photos.filter((photo) => !photo.alreadyImported).length;
    const total = (stored?.media.length ?? 0) + fresh;
    if (total > MAX_PRODUCT_PHOTOS) {
      errors.push({ row: product.variants[0]?.row ?? null, field: 'Photos', message: `"${product.name}" would have ${total} photos. A product can have at most ${MAX_PRODUCT_PHOTOS}.` });
    }
    if (total === 0) {
      warnings.push({ row: product.variants[0]?.row ?? null, field: 'Photos', message: `"${product.name}" has no photos` });
    }
  }

  const categories = [...plannedCategories.values()];
  const allVariants = products.flatMap((product) => product.variants);
  const allPhotos = products.flatMap((product) => product.photos);
  return {
    categories,
    products,
    errors,
    warnings,
    suggestions,
    summary: {
      rows: rowsInput.length,
      categories: { new: categories.filter((item) => !item.existingId).length, existing: categories.filter((item) => item.existingId).length },
      products: { new: products.filter((item) => !item.existingId).length, existing: products.filter((item) => item.existingId).length },
      variants: { new: allVariants.filter((item) => !item.existingId).length, existing: allVariants.filter((item) => item.existingId).length },
      photos: { toUpload: allPhotos.filter((photo) => !photo.alreadyImported).length, alreadyImported: allPhotos.filter((photo) => photo.alreadyImported).length, notAttached },
    },
  };
}
