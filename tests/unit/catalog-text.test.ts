import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSku, colourCode, firstFree, nearMatch, normalizeColour, normalizeSize, slugify } from '../../src/shared/catalog/catalog-text.js';

test('slugify lowercases, hyphenates and drops symbols', () => {
  assert.equal(slugify('Hoodie'), 'hoodie');
  assert.equal(slugify('Zip Hoodies'), 'zip-hoodies');
  assert.equal(slugify('T-Shirts & Polos'), 't-shirts-polos');
  assert.equal(slugify('  Limited   Edition Drops! '), 'limited-edition-drops');
  assert.equal(slugify('***'), '');
});

test('sizes are capitalised and common spellings map to the standard list', () => {
  assert.equal(normalizeSize(' m '), 'M');
  assert.equal(normalizeSize('Medium'), 'M');
  assert.equal(normalizeSize('extra large'), 'XL');
  assert.equal(normalizeSize('2xl'), 'XXL');
  assert.equal(normalizeSize('free'), 'FREE SIZE');
  assert.equal(normalizeSize('32'), '32');
  assert.equal(normalizeSize('4xl'), '4XL');
});

test('colours are title-cased and common spellings map to one name', () => {
  assert.equal(normalizeColour('grey'), 'Grey');
  assert.equal(normalizeColour('GRAY'), 'Grey');
  assert.equal(normalizeColour(' off  white '), 'Off-White');
  assert.equal(normalizeColour('navy blue'), 'Navy');
  assert.equal(normalizeColour('washed black'), 'Washed Black');
});

test('SKUs are built from product, colour and size', () => {
  assert.equal(buildSku('Project Requiem Zipup', 'Grey', 'M'), 'PROJECT-REQUIEM-ZIPUP-GRY-M');
  assert.equal(buildSku('Star Logo Cap', 'Black', 'FREE SIZE'), 'STAR-LOGO-CAP-BLK-FREE');
  assert.equal(colourCode('Washed Black'), 'WSH');
  assert.equal(colourCode('Teal'), 'TEA');
});

test('firstFree adds a number only when the value is taken', () => {
  const taken = new Set(['hoodie', 'hoodie-2']);
  assert.equal(firstFree('tees', (value) => taken.has(value)), 'tees');
  assert.equal(firstFree('hoodie', (value) => taken.has(value)), 'hoodie-3');
});

test('nearMatch spots likely typos but not exact or unrelated values', () => {
  assert.equal(nearMatch('Gery', ['Grey', 'Black']), 'Grey');
  assert.equal(nearMatch('Hoodies', ['Hoodie', 'Polo']), 'Hoodie');
  assert.equal(nearMatch('Project Requiem Zip-up', ['Project Requiem Zipup']), 'Project Requiem Zipup');
  assert.equal(nearMatch('grey', ['Grey']), undefined);
  assert.equal(nearMatch('Red', ['Bed', 'Black']), undefined);
  assert.equal(nearMatch('Navy', ['Black', 'White']), undefined);
});
