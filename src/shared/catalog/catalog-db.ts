import { AppError } from '../errors/app-error.js';
import { slugify } from './catalog-text.js';

/** Builds a slug from a name and adds a number until it is not taken. */
export async function generateSlug(name: string, exists: (candidate: string) => Promise<boolean>) {
  const base = slugify(name);
  if (!base) {
    throw new AppError(422, 'SLUG_UNAVAILABLE', 'Enter a name with letters or numbers so a web address can be created');
  }
  if (!(await exists(base))) return base;
  for (let index = 2; index < 1_000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new AppError(409, 'SLUG_UNAVAILABLE', 'Could not create a unique web address for this name');
}
