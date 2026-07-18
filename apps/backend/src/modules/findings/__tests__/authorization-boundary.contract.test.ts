import { describe, expect, it, vi } from 'vitest';

import type { CheckService, Decision } from '../../permissions/check-service.js';
import {
  actorFindingReadScope,
  checkFindingManage,
  checkFindingRead,
} from '../authorization.js';

const workspace_id = 'workspace-1';
const targetMs = 'active-ms';
const crossMs = 'cross-ms';
const archivedMs = 'archived-ms';

type Actor = {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
};

const actors: Record<string, Actor> = {
  admin: { actor_id: 'admin', workspace_id, role_level: 'admin' },
  scopedDeveloper: { actor_id: 'scoped-developer', workspace_id, role_level: 'developer' },
  unscopedDeveloper: { actor_id: 'unscoped-developer', workspace_id, role_level: 'developer' },
  userWithGrant: { actor_id: 'user-with-grant', workspace_id, role_level: 'user' },
  expiredDeveloper: { actor_id: 'expired-developer', workspace_id, role_level: 'developer' },
};

function policyCheckService() {
  const checkCapability = vi.fn(async (actor: Actor, _capability: string, scope: {
    managed_system_id?: string;
  }): Promise<Decision> => {
    const allowed =
      (actor.actor_id === 'scoped-developer' &&
        [targetMs, archivedMs].includes(scope.managed_system_id ?? '')) ||
      actor.actor_id === 'user-with-grant';
    return allowed
      ? { allow: true, via: 'managed_system_scope' }
      : { allow: false, reason: 'grant_expired', requestable: null };
  });
  return { checkCapability } as unknown as CheckService;
}

describe('Finding authorization semantic contract (#169)', () => {
  it('locks Admin-or-Developer point decisions across grant, cross-MS, archived-MS, and expiry cases', async () => {
    const checkService = policyCheckService();
    const matrix = [
      ['admin', targetMs, true],
      ['scopedDeveloper', targetMs, true],
      ['scopedDeveloper', crossMs, false],
      // A grant alone must not turn a User into a Finding reader/manager.
      ['userWithGrant', targetMs, false],
      // This is allowed by the permission double only on an archived target:
      // the point helper must delegate rather than enumerate active MS scope.
      ['scopedDeveloper', archivedMs, true],
      ['expiredDeveloper', targetMs, false],
      ['unscopedDeveloper', targetMs, false],
    ] as const;

    for (const [actorName, managedSystemId, expected] of matrix) {
      const actor = actors[actorName]!;
      await expect(checkFindingRead(checkService, actor, managedSystemId)).resolves.toMatchObject({
        allow: expected,
      });
      await expect(checkFindingManage(checkService, actor, managedSystemId)).resolves.toMatchObject({
        allow: expected,
      });
    }

    // The User's fake grant is deliberately permissive, proving the canonical
    // role gate—not CheckService's capability result—produces both denials.
    const userCalls = vi
      .mocked(checkService.checkCapability)
      .mock.calls.filter(([actor]) => actor.actor_id === actors.userWithGrant!.actor_id);
    expect(userCalls).toHaveLength(0);
  });

  it('keeps scope resolution as a list-only form and denies User before querying scope storage', async () => {
    await expect(
      actorFindingReadScope({} as never, actors.admin!),
    ).resolves.toEqual({ kind: 'all' });
    await expect(
      actorFindingReadScope({} as never, actors.userWithGrant!),
    ).resolves.toEqual({ kind: 'scoped', managedSystemIds: [] });
  });
});
