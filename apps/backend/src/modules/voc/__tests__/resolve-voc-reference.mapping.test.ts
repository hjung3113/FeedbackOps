// resolveVocReference error-mapping branches (#378) that the real access
// matrix cannot reach: getVocDetail ends reads in full/summary/not_found.record
// and never raises permission.denied itself. Those outcomes are driven here by
// stubbing the read-model BELOW getVocDetail (repo-read), so the real
// getVocDetail → resolveVocReference mapping code is what runs — no DB.
//
// full/summary/not_found.record outcomes against the real access rules are
// covered in resolve-voc-reference.integration.test.ts.

import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../../../lib/errors.js';

const selectVocByIdForRead = vi.hoisted(() => vi.fn());

vi.mock('../repo-read.js', () => ({
  selectVocByIdForRead,
}));

import type { Db } from '../../../db/client.js';
import type { EntityLinksService } from '../../entity-links/index.js';
import type { CheckService } from '../../permissions/check-service.js';
import { type ReadActorContext, createVocReadService } from '../read-service.js';

const actor: ReadActorContext = {
  actor_id: '01919b8c-0000-7000-8000-000000000001',
  workspace_id: '01919b8c-0000-7000-8000-000000000002',
  role_level: 'developer',
};

const vocReadService = createVocReadService({
  db: {} as Db,
  checkService: {} as CheckService,
  entityLinksService: {
    canReadEndpoint: vi.fn().mockResolvedValue(true),
  } as unknown as EntityLinksService,
});

describe('resolveVocReference error mapping (#378)', () => {
  it('maps a missing VOC row (not_found.record) to hidden', async () => {
    selectVocByIdForRead.mockResolvedValue(null);

    await expect(
      vocReadService.resolveVocReference({ actor, vocId: '01919b8c-0000-7000-8000-000000000003' }),
    ).resolves.toEqual({ visibility_state: 'hidden' });
  });

  it('maps permission.denied to denied', async () => {
    selectVocByIdForRead.mockRejectedValue(
      new HttpError('permission.denied', 'no voc.read scope for actor'),
    );

    await expect(
      vocReadService.resolveVocReference({ actor, vocId: '01919b8c-0000-7000-8000-000000000003' }),
    ).resolves.toEqual({ visibility_state: 'denied' });
  });

  it('rethrows unrelated HttpErrors untouched', async () => {
    selectVocByIdForRead.mockRejectedValue(new HttpError('validation.failed', 'boom'));

    await expect(
      vocReadService.resolveVocReference({ actor, vocId: '01919b8c-0000-7000-8000-000000000003' }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('rethrows non-Http failures untouched', async () => {
    selectVocByIdForRead.mockRejectedValue(new Error('connection reset'));

    await expect(
      vocReadService.resolveVocReference({ actor, vocId: '01919b8c-0000-7000-8000-000000000003' }),
    ).rejects.toThrow('connection reset');
  });
});
