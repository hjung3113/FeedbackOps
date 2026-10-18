import { describe, expect, it } from 'vitest';

import { HttpError } from '../../../lib/errors.js';
import type { Scope } from '../authorization.js';
import type { ReadActorContext } from '../read-service.js';
import { resolveVocListScope } from '../read/scope.js';

const actor: ReadActorContext = {
  actor_id: '01919b8c-0000-7000-8000-000000000001',
  workspace_id: '01919b8c-0000-7000-8000-000000000002',
  role_level: 'developer',
};
const A = '01919b8c-0000-7000-8000-00000000000a';
const B = '01919b8c-0000-7000-8000-00000000000b';

function scoped(ids: string[]): Scope {
  return { kind: 'scoped', managedSystemIds: ids };
}

function requestable(read: Scope, triage: Scope, managedSystemId?: string) {
  try {
    resolveVocListScope({
      actor,
      query: {
        view: 'triage',
        ...(managedSystemId !== undefined ? { managed_system_id: managedSystemId } : {}),
      },
      readScope: read,
      triageScope: triage,
    });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return {
      code: error.code,
      permission: (
        error.detail as {
          requestable_permission?: { permission: string; managed_system_id: string | null };
        }
      ).requestable_permission,
    };
  }
  throw new Error('expected triage scope to reject');
}

describe('triage list requestable when read and triage do not both cover the queue', () => {
  it.each([
    {
      name: 'workspace-wide triage and no read, no System',
      read: scoped([]),
      triage: { kind: 'all' },
      selected: undefined,
      code: 'permission.denied',
      permission: 'voc.read',
      system: null,
    },
  ] as const)(
    '$name requests $permission',
    ({ read, triage, selected, code, permission, system }) => {
      expect(requestable(read, triage, selected)).toEqual({
        code,
        permission: { permission, managed_system_id: system },
      });
    },
  );

  it('still returns a selection that is inside read ∩ triage', () => {
    expect(
      resolveVocListScope({
        actor,
        query: { view: 'triage', managed_system_id: A },
        readScope: scoped([A, B]),
        triageScope: scoped([A]),
      }),
    ).toEqual({ scopeFilter: { kind: 'scoped', managedSystemIds: [A] } });
  });
});
