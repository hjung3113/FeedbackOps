import { describe, expect, it, vi } from 'vitest';

import type { Capability } from '@fops/shared';
import type { Tx } from '../../../db/tx.js';
import {
  type ActorContext,
  type CheckScope,
  type CheckService,
  type Decision,
  memoizeCapabilityChecks,
} from '../check-service.js';

const actor: ActorContext = {
  actor_id: 'developer-1',
  workspace_id: 'workspace-1',
  role_level: 'developer',
};
const scope: CheckScope = { workspace_id: 'workspace-1', managed_system_id: 'system-1' };
const allowed: Decision = { allow: true, via: 'managed_system_scope', grant_id: 'grant-1' };

function fakeService(decision: Decision = allowed) {
  const checkCapability = vi.fn<CheckService['checkCapability']>().mockResolvedValue(decision);
  const capabilityScope = vi
    .fn<CheckService['capabilityScope']>()
    .mockResolvedValue({ kind: 'all' });
  return { checkCapability, capabilityScope } satisfies CheckService;
}

describe('memoizeCapabilityChecks', () => {
  it.each<Decision>([
    allowed,
    { allow: true, via: 'role' },
    { allow: false, reason: 'explicit_deny', requestable: null },
    { allow: false, reason: 'no_grant', requestable: [{ workspace_id: 'workspace-1' }] },
    { allow: false, reason: 'grant_expired', requestable: [] },
    { allow: false, reason: 'grant_revoked', requestable: [] },
    { allow: false, reason: 'workspace_mismatch', requestable: null },
  ])('preserves decision %j', async (decision) => {
    const service = fakeService(decision);
    const memo = memoizeCapabilityChecks(service);
    expect(await memo.checkCapability(actor, 'finding.read', scope)).toEqual(decision);
  });

  it.each(['sequential', 'concurrent'] as const)('shares identical %s checks', async (mode) => {
    const service = fakeService();
    let resolve!: (decision: Decision) => void;
    service.checkCapability.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const memo = memoizeCapabilityChecks(service);
    const first = memo.checkCapability(actor, 'finding.read', scope);
    let second: Promise<Decision>;
    if (mode === 'sequential') {
      resolve(allowed);
      await first;
      second = memo.checkCapability({ ...actor }, 'finding.read', { ...scope });
    } else {
      second = memo.checkCapability({ ...actor }, 'finding.read', { ...scope });
      expect(second).toBe(first);
      resolve(allowed);
    }
    expect(await Promise.all([first, second])).toEqual([allowed, allowed]);
    expect(service.checkCapability).toHaveBeenCalledTimes(1);
  });

  it.each<{
    label: string;
    otherActor?: ActorContext;
    otherCapability?: Capability;
    otherScope?: CheckScope;
  }>([
    { label: 'Managed System', otherScope: { ...scope, managed_system_id: 'system-2' } },
    { label: 'capability', otherCapability: 'finding.manage' },
    { label: 'actor id', otherActor: { ...actor, actor_id: 'developer-2' } },
    { label: 'actor workspace', otherActor: { ...actor, workspace_id: 'workspace-2' } },
    { label: 'actor role', otherActor: { ...actor, role_level: 'admin' } },
    { label: 'scope workspace', otherScope: { ...scope, workspace_id: 'workspace-2' } },
    { label: 'absent Managed System', otherScope: { workspace_id: 'workspace-1' } },
  ])('separates checks for a different $label', async (testCase) => {
    const service = fakeService();
    const memo = memoizeCapabilityChecks(service);
    await memo.checkCapability(actor, 'finding.read', scope);
    await memo.checkCapability(
      testCase.otherActor ?? actor,
      testCase.otherCapability ?? 'finding.read',
      testCase.otherScope ?? scope,
    );
    expect(service.checkCapability).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache for every transaction check', async () => {
    const service = fakeService();
    const memo = memoizeCapabilityChecks(service);
    const tx = {} as Tx;
    await memo.checkCapability(actor, 'finding.read', scope);
    service.checkCapability.mockResolvedValue({
      allow: false,
      reason: 'explicit_deny',
      requestable: null,
    });
    for (let i = 0; i < 2; i++) {
      expect(await memo.checkCapability(actor, 'finding.read', scope, { tx })).toEqual({
        allow: false,
        reason: 'explicit_deny',
        requestable: null,
      });
    }
    expect(await memo.checkCapability(actor, 'finding.read', scope)).toEqual(allowed);
    expect(service.checkCapability).toHaveBeenCalledTimes(3);
    expect(service.checkCapability).toHaveBeenLastCalledWith(actor, 'finding.read', scope, { tx });
  });

  it('retries after a rejected check', async () => {
    const service = fakeService();
    service.checkCapability.mockRejectedValueOnce(new Error('read failed'));
    const memo = memoizeCapabilityChecks(service);
    await expect(memo.checkCapability(actor, 'finding.read', scope)).rejects.toThrow('read failed');
    expect(await memo.checkCapability(actor, 'finding.read', scope)).toEqual(allowed);
    expect(service.checkCapability).toHaveBeenCalledTimes(2);
  });

  it('keeps separate read-call wrappers independent', async () => {
    const service = fakeService();
    await memoizeCapabilityChecks(service).checkCapability(actor, 'finding.read', scope);
    await memoizeCapabilityChecks(service).checkCapability(actor, 'finding.read', scope);
    expect(service.checkCapability).toHaveBeenCalledTimes(2);
  });

  it('delegates capabilityScope unchanged on every call', async () => {
    const service = fakeService();
    const memo = memoizeCapabilityChecks(service);
    expect(memo.capabilityScope).toBe(service.capabilityScope);
    await memo.capabilityScope(actor, 'finding.read', scope);
    await memo.capabilityScope(actor, 'finding.read', scope);
    expect(service.capabilityScope).toHaveBeenCalledTimes(2);
  });
});
