import { describe, expect, it } from 'vitest';

import { vocReadPrerequisiteState } from '../grant-admin-service.js';

const A = '01919b8c-0000-7000-8000-00000000000a';
const B = '01919b8c-0000-7000-8000-00000000000b';

describe('voc.read prerequisite on a voc.triage candidate', () => {
  it.each([
    {
      name: 'no read grant',
      system: A,
      scope: { kind: 'scoped' as const, managed_system_ids: [] },
      denies: [],
      state: 'missing' as const,
    },
    {
      name: 'read held on the same system',
      system: A,
      scope: { kind: 'scoped' as const, managed_system_ids: [A] },
      denies: [],
      state: 'held' as const,
    },
    {
      name: 'workspace read covers the system',
      system: A,
      scope: { kind: 'all' as const },
      denies: [],
      state: 'held' as const,
    },
    {
      name: 'explicit deny on the system wins over coverage',
      system: A,
      scope: { kind: 'scoped' as const, managed_system_ids: [B] },
      denies: [{ managedSystemId: A }],
      state: 'denied' as const,
    },
    {
      name: 'workspace deny blocks the system',
      system: A,
      scope: { kind: 'scoped' as const, managed_system_ids: [] },
      denies: [{ managedSystemId: null }],
      state: 'denied' as const,
    },
    {
      name: 'a deny on another system does not block this one',
      system: A,
      scope: { kind: 'scoped' as const, managed_system_ids: [A] },
      denies: [{ managedSystemId: B }],
      state: 'held' as const,
    },
    {
      name: 'workspace triage needs workspace read',
      system: null,
      scope: { kind: 'scoped' as const, managed_system_ids: [A] },
      denies: [],
      state: 'missing' as const,
    },
    {
      name: 'workspace read is held only when the effective scope is all',
      system: null,
      scope: { kind: 'all' as const },
      denies: [],
      state: 'held' as const,
    },
    {
      name: 'any active deny blocks workspace read',
      system: null,
      scope: { kind: 'all' as const },
      denies: [{ managedSystemId: A }],
      state: 'denied' as const,
    },
  ])('$name → $state', ({ system, scope, denies, state }) => {
    expect(vocReadPrerequisiteState(system, scope, denies)).toBe(state);
  });
});
