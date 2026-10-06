import assert from 'node:assert/strict';
import test from 'node:test';
import { planImport, type ExistingCatalog, type ImportRowInput } from '../../src/admin/imports/import-plan.js';

const empty: ExistingCatalog = { categories: [], products: [], skus: [], colours: [] };

function row(index: number, overrides: Partial<ImportRowInput> = {}): ImportRowInput {
  return { row: index, category: 'Hoodie', productName: 'Project Requiem Zipup', description: 'Heavyweight zip hoodie', colour: 'Grey', size: 'M', price: 4500, stock: 10, ...overrides };
}

test('rows group into one product with generated slug and SKUs', () => {
  const plan = planImport([row(2), row(3, { description: '', size: 'l' }), row(4, { description: '', colour: 'black' })], [], empty);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.products.length, 1);
  const product = plan.products[0]!;
  assert.equal(product.slug, 'project-requiem-zipup');
  assert.equal(product.status, 'draft');
  assert.deepEqual(product.variants.map((variant) => variant.sku), ['PROJECT-REQUIEM-ZIPUP-GRY-M', 'PROJECT-REQUIEM-ZIPUP-GRY-L', 'PROJECT-REQUIEM-ZIPUP-BLK-M']);
  assert.deepEqual(plan.categories.map((category) => [category.name, category.slug, category.existingId]), [['Hoodie', 'hoodie', null]]);
  assert.deepEqual(plan.summary.variants, { new: 3, existing: 0 });
});

test('existing categories, products and variants are reused, never duplicated', () => {
  const existing: ExistingCatalog = {
    categories: [{ id: 'c1', name: 'Hoodie', slug: 'hoodie' }],
    products: [{ id: 'p1', name: 'Project Requiem Zipup', slug: 'project-requiem-zipup', variants: [{ id: 'v1', sku: 'OLD-SKU', size: 'M', color: 'Grey' }], media: [{ color: 'Grey', sourceName: '1.jpg' }] }],
    skus: ['OLD-SKU'],
    colours: ['Grey'],
  };
  const plan = planImport(
    [row(2, { category: 'hoodie', price: '4,800' }), row(3, { size: 'L', description: '' })],
    [{ path: 'photos/Project Requiem Zipup/Grey/1.jpg', product: 'Project Requiem Zipup', colour: 'Grey', file: '1.jpg' }, { path: 'photos/Project Requiem Zipup/Grey/2.jpg', product: 'Project Requiem Zipup', colour: 'Grey', file: '2.jpg' }],
    existing,
  );
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.categories[0]!.existingId, 'c1');
  assert.equal(plan.products[0]!.existingId, 'p1');
  assert.deepEqual(plan.products[0]!.variants.map((variant) => [variant.existingId, variant.sku, variant.price]), [['v1', 'OLD-SKU', '4800.00'], [null, 'PROJECT-REQUIEM-ZIPUP-GRY-L', '4500.00']]);
  assert.deepEqual(plan.summary.photos, { toUpload: 1, alreadyImported: 1, notAttached: 0 });
});

test('bad cells are reported with their row and block nothing else', () => {
  const plan = planImport([row(2, { price: 'abc' }), row(3, { stock: -1, size: 'L' }), row(4, { colour: '', size: 'XL' }), row(5, { size: 'M' })], [], empty);
  assert.deepEqual(plan.errors.map((issue) => [issue.row, issue.field]), [[2, 'Price'], [3, 'Stock'], [4, 'Colour']]);
  assert.equal(plan.products[0]!.variants.length, 1);
});

test('the same colour and size twice on a product is an error', () => {
  const plan = planImport([row(2), row(3, { size: 'medium', description: '' })], [], empty);
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0]!.message, /already has Grey \/ M on row 2/);
});

test('likely typos are suggested until confirmed as new', () => {
  const rows = [row(2), row(3, { size: 'L' }), row(4, { colour: 'Gery', size: 'XL' }), row(5, { category: 'Hoodies', productName: 'Night Coach Jacket', colour: 'Black' })];
  const plan = planImport(rows, [], empty);
  assert.deepEqual(plan.suggestions.map((item) => [item.kind, item.value, item.suggestion]), [['category', 'Hoodies', 'Hoodie'], ['colour', 'Gery', 'Grey']]);
  const confirmed = planImport(rows, [], empty, ['category:hoodies', 'colour:gery']);
  assert.deepEqual(confirmed.suggestions, []);
});

test('alternate spellings never become a second colour', () => {
  const plan = planImport([row(2), row(3, { colour: 'gray', size: 'L' })], [], empty);
  assert.deepEqual(plan.suggestions, []);
  assert.deepEqual([...new Set(plan.products[0]!.variants.map((variant) => variant.colour))], ['Grey']);
});

test('photo folders match products and colours, and report what is left over', () => {
  const plan = planImport(
    [row(2), row(3, { colour: 'Black' })],
    [
      { path: 'photos/Project Requiem Zipup/1.jpg', product: 'Project Requiem Zipup', colour: null, file: '1.jpg' },
      { path: 'photos/project requiem zip-up/Gray/1.jpg', product: 'project requiem zip-up', colour: 'Gray', file: '1.jpg' },
      { path: 'photos/Project Requiem Zipup/Red/1.jpg', product: 'Project Requiem Zipup', colour: 'Red', file: '1.jpg' },
      { path: 'photos/Unknown Tee/1.jpg', product: 'Unknown Tee', colour: null, file: '1.jpg' },
      { path: 'photos/Project Requiem Zipup/notes.txt', product: 'Project Requiem Zipup', colour: null, file: 'notes.txt' },
    ],
    empty,
  );
  assert.deepEqual(plan.products[0]!.photos.map((photo) => [photo.colour, photo.file]), [[null, '1.jpg'], ['Grey', '1.jpg']]);
  assert.equal(plan.summary.photos.notAttached, 3);
  assert.equal(plan.errors.length, 0);
});

test('a new product needs a description and one category', () => {
  const plan = planImport([row(2, { description: '' }), row(3, { description: '', size: 'L', category: 'Polo' })], [], empty);
  assert.deepEqual(plan.errors.map((issue) => issue.field).sort(), ['Category', 'Description']);
});
