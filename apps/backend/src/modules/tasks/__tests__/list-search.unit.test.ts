import { listFindingsQuerySchema, listTasksQuerySchema } from '@fops/shared';
import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from '../../../lib/sql-like.js';

describe.each([
  ['Tasks', listTasksQuerySchema],
  ['Findings', listFindingsQuerySchema],
] as const)('%s list search contract', (_name, schema) => {
  it('normalizes search and rejects overlong text at q', () => {
    expect(schema.parse({ q: '  MiXeD %_\\  ' })).toEqual({ q: 'MiXeD %_\\' });
    expect(schema.parse({ q: '  ' }).q).toBeUndefined();
    expect(schema.parse({}).q).toBeUndefined();
    expect(schema.safeParse({ q: 'a'.repeat(100) }).success).toBe(true);
    const result = schema.safeParse({ q: 'a'.repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toMatchObject([{ path: ['q'], code: 'too_big' }]);
  });
});

it.each([
  ['plain', 'plain'],
  ['50%_\\', '50\\%\\_\\\\'],
  ["O'Reilly", "O'Reilly"],
])('escapes literal LIKE metacharacters in %s for all three list callers', (input, expected) => {
  expect(escapeLikePattern(input)).toBe(expected);
});
