import { RECOVERY_CATEGORIES, type RecoveryCategory } from '@fops/shared';
import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';

export function recoveryIdentity(category: RecoveryCategory, sourceId: string): string {
  return `r1_${Buffer.concat([
    Buffer.from([RECOVERY_CATEGORIES.indexOf(category) + 1]),
    Buffer.from(sourceId.replaceAll('-', ''), 'hex'),
  ]).toString('base64url')}`;
}
export function decodeRecoveryIdentity(token: string): {
  category: RecoveryCategory;
  sourceId: string;
} {
  const missing = () => new HttpError('not_found.record', 'recovery item not found');
  if (!/^r1_[A-Za-z0-9_-]{23}$/.test(token)) throw missing();
  const bytes = Buffer.from(token.slice(3), 'base64url');
  const category = RECOVERY_CATEGORIES[(bytes[0] ?? 0) - 1];
  if (bytes.length !== 17 || !category) throw missing();
  const hex = bytes.subarray(1).toString('hex');
  const sourceId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (
    !z.string().uuid().safeParse(sourceId).success ||
    recoveryIdentity(category, sourceId) !== token
  )
    throw missing();
  return { category, sourceId };
}
