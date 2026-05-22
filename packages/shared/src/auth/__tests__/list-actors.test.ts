import { describe, expect, it } from 'vitest';

import { listActorsResponseSchema } from '../list-actors.js';

describe('listActorsResponseSchema', () => {
  it('accepts a valid response with one actor', () => {
    const parsed = listActorsResponseSchema.parse({
      actors: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          display_name: 'Mock Admin',
          email: 'admin@feedbackops.local',
          role_level: 'admin',
        },
      ],
    });
    expect(parsed.actors).toHaveLength(1);
    expect(parsed.actors[0]?.role_level).toBe('admin');
  });

  it('accepts an empty actors array', () => {
    expect(() => listActorsResponseSchema.parse({ actors: [] })).not.toThrow();
  });

  it('rejects unknown role_level values', () => {
    const result = listActorsResponseSchema.safeParse({
      actors: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          display_name: 'X',
          email: 'x@example.com',
          role_level: 'guest', // not in ROLE_LEVEL_VALUES
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid id', () => {
    const result = listActorsResponseSchema.safeParse({
      actors: [
        {
          id: 'not-a-uuid',
          display_name: 'X',
          email: 'x@example.com',
          role_level: 'user',
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
