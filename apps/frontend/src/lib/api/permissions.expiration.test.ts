import { describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({ apiClient: apiClientMock }));

import { decidePermissionRequest } from './permissions';

const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IDEMPOTENCY_KEY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('permission approval expiration request body', () => {
  it.each([{ expiration: '2027-01-31T23:59:59.000Z' }, { expiration: null }])(
    'sends the selected approval expiration',
    async ({ expiration }) => {
      apiClientMock.mockResolvedValue({
        data: { id: REQUEST_ID, status: 'approved', grant_id: REQUEST_ID },
      });

      await decidePermissionRequest(
        REQUEST_ID,
        'approve',
        '',
        IDEMPOTENCY_KEY,
        undefined,
        expiration,
      );

      expect(apiClientMock).toHaveBeenCalledWith(
        'POST',
        `/permissions/requests/${REQUEST_ID}/approve`,
        {
          body: { reason: undefined, expiration },
          idempotencyKey: IDEMPOTENCY_KEY,
        },
      );
    },
  );
});
