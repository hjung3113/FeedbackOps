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
          actor_type: 'internal_member',
        },
      ],
    });
    expect(parsed.actors).toHaveLength(1);
    expect(parsed.actors[0]?.role_level).toBe('admin');
    expect(parsed.actors[0]?.actor_type).toBe('internal_member');
  });

  it('accepts an empty actors array', () => {
    expect(() => listActorsResponseSchema.parse({ actors: [] })).not.toThrow();
  });

  it('rejects unknown actor_type values', () => {
    const result = listActorsResponseSchema.safeParse({
      actors: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          display_name: 'X',
          email: 'x@example.com',
          role_level: 'admin',
          actor_type: 'robot', // not in ACTOR_TYPE_VALUES
        },
      ],
    });
    expect(result.success).toBe(false);
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
