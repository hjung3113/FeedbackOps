import { describe, expect, it } from 'vitest';
import {
  decodeEvidenceInventoryCursor,
  encodeEvidenceInventoryCursor,
} from '../evidence-inventory-cursor.js';

const context = {
  workspace: '00000000-0000-4000-8000-000000000001',
  actor: '00000000-0000-4000-8000-000000000002',
  scope: 'all',
  source: 'all',
  q: '',
};
const raw = (timestamp: string) =>
  Buffer.from(
    JSON.stringify({ ...context, timestamp, id: '00000000-0000-4000-8000-000000000003' }),
  ).toString('base64url');

describe('Evidence inventory cursor timestamp', () => {
  it('round-trips a real offset timestamp', () => {
    const cursor = decodeEvidenceInventoryCursor(raw('2026-10-13T09:00:00+09:00'), context);
    expect(decodeEvidenceInventoryCursor(encodeEvidenceInventoryCursor(cursor), context).id).toBe(
      cursor.id,
    );
  });

  it.each(['2026-10-13T00:00:00+99:99', '2026-10-13T00:00:00+24:00', '2026-10-13T00:00:00+14:60'])(
    'rejects %s as an invalid cursor instead of reaching the database',
    (timestamp) => {
      expect(() => decodeEvidenceInventoryCursor(raw(timestamp), context)).toThrow(
        expect.objectContaining({ code: 'validation.failed' }),
      );
    },
  );
});
