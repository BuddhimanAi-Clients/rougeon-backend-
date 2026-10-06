// One place for how catalogue text is cleaned and how slugs and SKUs are
// built, so the Admin forms, the bulk import and the API all agree.

export const STANDARD_SIZES = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'FREE SIZE',
  '28', '30', '32', '34', '36', '38',
] as const;

const SIZE_ALIASES: Record<string, string> = {
  'EXTRA SMALL': 'XS', 'X-SMALL': 'XS', 'XSMALL': 'XS',
  'SMALL': 'S', 'SM': 'S',
  'MEDIUM': 'M', 'MED': 'M', 'MD': 'M',
  'LARGE': 'L', 'LG': 'L',
  'EXTRA LARGE': 'XL', 'X-LARGE': 'XL', 'XLARGE': 'XL',
  '2XL': 'XXL', 'XX-LARGE': 'XXL', 'DOUBLE XL': 'XXL',
  'XXXL': '3XL', 'XXX-LARGE': '3XL',
  'FREE': 'FREE SIZE', 'FREESIZE': 'FREE SIZE', 'ONE SIZE': 'FREE SIZE', 'ONESIZE': 'FREE SIZE', 'OS': 'FREE SIZE',
};

const COLOUR_ALIASES: Record<string, string> = {
  'gray': 'Grey', 'grey': 'Grey', 'gry': 'Grey',
  'blk': 'Black', 'wht': 'White',
  'off white': 'Off-White', 'offwhite': 'Off-White', 'off-white': 'Off-White',
  'navy blue': 'Navy', 'navyblue': 'Navy',
  'charcoal gray': 'Charcoal', 'charcoal grey': 'Charcoal',
  'light gray': 'Light Grey', 'dark gray': 'Dark Grey',
  'biege': 'Beige', 'maroon red': 'Maroon',
};

const COLOUR_CODES: Record<string, string> = {
  'black': 'BLK', 'white': 'WHT', 'grey': 'GRY', 'navy': 'NVY', 'blue': 'BLU', 'red': 'RED',
  'green': 'GRN', 'brown': 'BRN', 'beige': 'BGE', 'cream': 'CRM', 'off-white': 'OWH', 'olive': 'OLV',
  'maroon': 'MRN', 'pink': 'PNK', 'purple': 'PRP', 'yellow': 'YLW', 'orange': 'ORG', 'charcoal': 'CHR',
  'khaki': 'KHK', 'light grey': 'LGY', 'dark grey': 'DGY',
};

function collapse(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

/** "T-Shirts & Polos" -> "t-shirts-polos". Empty when nothing usable remains. */
export function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}

/** Sizes are stored in capitals; common spellings map to the standard list. */
export function normalizeSize(value: string) {
  const upper = collapse(value).toUpperCase();
  return SIZE_ALIASES[upper] ?? upper;
}

export function isStandardSize(size: string) {
  return (STANDARD_SIZES as readonly string[]).includes(size);
}

/** Colours are stored in Title Case; common spellings map to one name. */
export function normalizeColour(value: string) {
  const clean = collapse(value);
  const alias = COLOUR_ALIASES[clean.toLowerCase()];
  if (alias) return alias;
  return clean
    .toLowerCase()
    .replace(/(^|[\s\-/])([a-z])/g, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
}

/** Tidy a category or product name without changing its wording. */
export function normalizeName(value: string) {
  return collapse(value);
}

/** Case- and spacing-insensitive identity, used to decide "the same thing". */
export function nameKey(value: string) {
  return collapse(value).toLowerCase();
}

export function colourCode(colour: string) {
  const known = COLOUR_CODES[colour.toLowerCase()];
  if (known) return known;
  const letters = colour.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const consonants = (letters[0] ?? '') + letters.slice(1).replace(/[AEIOU]/g, '');
  return (consonants.length >= 3 ? consonants : letters).slice(0, 3) || 'CLR';
}

/** "Project Requiem Zipup" + Grey + M -> "PROJECT-REQUIEM-ZIPUP-GRY-M". */
export function buildSku(productName: string, colour: string, size: string) {
  const product = slugify(productName).toUpperCase().slice(0, 48).replace(/-+$/g, '') || 'ITEM';
  const sizePart = (size === 'FREE SIZE' ? 'FREE' : size).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return `${product}-${colourCode(colour)}-${sizePart || 'OS'}`;
}

/** Returns `base`, or `base-2`, `base-3`... — the first one not taken. */
export function firstFree(base: string, taken: (candidate: string) => boolean) {
  if (!taken(base)) return base;
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error(`No free value for ${base}`);
}

// Edit distance where swapping two neighbouring letters ("Gery" for "Grey")
// counts as a single mistake, as it does for a person typing.
function editDistance(left: string, right: string) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const table: number[][] = Array.from({ length: rows }, (_row, row) => Array.from({ length: columns }, (_cell, column) => (row === 0 ? column : column === 0 ? row : 0)));
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      let value = Math.min(table[row - 1]![column]! + 1, table[row]![column - 1]! + 1, table[row - 1]![column - 1]! + cost);
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        value = Math.min(value, table[row - 2]![column - 2]! + 1);
      }
      table[row]![column] = value;
    }
  }
  return table[left.length]![right.length]!;
}

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds a likely intended value for a probable typo: "Gery" -> "Grey",
 * "Hoodies" -> "Hoodie". Returns nothing when the value is itself a candidate
 * or nothing is close enough.
 */
export function nearMatch(value: string, candidates: Iterable<string>) {
  const target = compact(value);
  if (!target) return undefined;
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const other = compact(candidate);
    if (!other) continue;
    if (other === target) {
      if (nameKey(candidate) === nameKey(value)) return undefined;
      // Same letters, different punctuation or spacing: "Zip-up" vs "Zipup".
      return candidate;
    }
    const shorter = Math.min(target.length, other.length);
    const allowed = shorter <= 3 ? 0 : shorter <= 6 ? 1 : 2;
    if (allowed === 0 || Math.abs(target.length - other.length) > allowed) continue;
    const distance = editDistance(target, other);
    if (distance <= allowed && (!best || distance < best.distance)) best = { candidate, distance };
  }
  return best?.candidate;
}
