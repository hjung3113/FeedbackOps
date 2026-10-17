import { describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({ apiRequest: apiRequestMock }));

import { decidePermissionRequest } from './permissions';

const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IDEMPOTENCY_KEY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('permission approval expiration request body', () => {
  it.each([{ expiration: '2027-01-31T23:59:59.000Z' }, { expiration: null }])(
    'sends the selected approval expiration',
    async ({ expiration }) => {
      apiRequestMock.mockResolvedValue({
        data: {
          id: REQUEST_ID,
          revision: 8,
          updated_at: '2026-10-13T00:00:00.000Z',
          status: 'approved',
          grant_id: REQUEST_ID,
        },
      });

      await decidePermissionRequest(
        REQUEST_ID,
        'approve',
        '',
        IDEMPOTENCY_KEY,
        7,
        undefined,
        expiration,
      );

      expect(apiRequestMock).toHaveBeenCalledWith(
        'POST',
        `/permissions/requests/${REQUEST_ID}/approve`,
        expect.objectContaining({ parse: expect.any(Function) }),
        {
          body: { expected_revision: 7, expiration },
          idempotencyKey: IDEMPOTENCY_KEY,
        },
      );
    },
  );
});
