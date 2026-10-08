import { describe, expect, it } from 'vitest';

import { parseAppSearch, stringifyAppSearch } from '../search-serialization';

const UUID = '01919b8c-0000-7000-8000-000000000001';

interface RoundTripRow {
  name: string;
  /** Exact URL string the router writes (`stringifyAppSearch`) or reads (`parseAppSearch`). */
  url: string;
  /** Search object the router navigates with; omitted for legacy parse-only links. */
  search?: Record<string, unknown>;
  /** Expected parse result when it differs from `search` (legacy links). */
  parsed?: Record<string, unknown>;
}

// #850: numeric-looking search values stay unquoted strings in the URL. Every
// row pins both directions: the exact URL string and the value parsing it back.
const rows: RoundTripRow[] = [
  { name: 'numeric search text stays raw and string-typed', url: '?q=1000', search: { q: '1000' } },
  { name: 'alphanumeric search text stays raw', url: '?q=12a', search: { q: '12a' } },
  { name: 'boolean-looking string stays quoted', url: '?q=%22true%22', search: { q: 'true' } },
  { name: 'real booleans round-trip unquoted', url: '?builder=true', search: { builder: true } },
  { name: 'uuid stays raw', url: `?selected=${UUID}`, search: { selected: UUID } },
  {
    name: 'comma list stays raw',
    url: '?filter.severity=high%2Ccritical',
    search: { 'filter.severity': 'high,critical' },
  },
  {
    name: 'legacy quoted number link parses as a string',
    url: '?q=%221000%22',
    parsed: { q: '1000' },
  },
];

describe('app search serialization (#850)', () => {
  it.each(rows)('$name', (row) => {
    if (row.search !== undefined) {
      expect(stringifyAppSearch(row.search)).toBe(row.url);
    }
    expect(parseAppSearch(row.url)).toEqual(row.parsed ?? row.search);
  });
});
