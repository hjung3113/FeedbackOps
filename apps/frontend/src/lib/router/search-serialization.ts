import { parseSearchWith, stringifySearchWith } from '@tanstack/react-router';

// #850 — App search serialization.
//
// TanStack's default `stringifySearch` JSON-quotes any string that JSON-parses,
// so the inbox search `q='1000'` became `?q=%221000%22`. Worse, its decoder
// (qss `toValue`) turns bare digits in a hand-typed URL (`?q=1000`) into a
// number *before* the JSON step runs, so the number reached the route's
// `z.string()` search schema and the value was dropped.
//
// Audit (#850): no route search schema declares a number — every value is a
// string except the booleans `builder` (Survey detail) and `includeArchived`
// (Admin Analytics Areas). So digits never need to be a number.

/**
 * JSON-parses one decoded search value, but a JSON number is rolled back to
 * the original string: `'1000'` stays `'1000'`, never `1000`. Booleans, null,
 * objects and arrays keep their parsed type (legacy links keep working).
 */
function parseSearchValue(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'number' ? value : parsed;
  } catch {
    return value;
  }
}

const parseJsonSearch = parseSearchWith(parseSearchValue);

export function parseAppSearch(searchStr: string): Record<string, unknown> {
  const query: Record<string, unknown> = { ...parseJsonSearch(searchStr) };
  // qss has already converted bare digits (`?q=1000`) to numbers, so numbers
  // can arrive here directly from the URL without ever passing JSON.parse.
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (typeof value === 'number') {
      query[key] = String(value);
    } else if (Array.isArray(value)) {
      query[key] = value.map((item) => (typeof item === 'number' ? String(item) : item));
    }
  }
  return query;
}

/**
 * Refuses JSON numbers so `stringifySearchWith` writes numeric-looking strings
 * raw (`q=1000`); other JSON-typed strings (`'true'`, `'null'`, `'{…}'`) still
 * get JSON-quoted so they parse back as strings, not as their JSON types.
 */
function quoteNonNumericJson(value: string): void {
  if (typeof JSON.parse(value) === 'number') {
    throw new Error('numeric-looking string is written raw');
  }
}

export const stringifyAppSearch = stringifySearchWith(JSON.stringify, quoteNonNumericJson);
