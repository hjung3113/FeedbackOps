import { recoveryCategorySchema } from '@fops/shared';
import { z } from 'zod';

/** Only bounded internal queue returns; never decode an opaque item identity. */
export function safeRecoveryReturnTo(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return undefined;
  try {
    const url = new URL(value, 'https://recovery.internal');
    if (
      url.origin !== 'https://recovery.internal' ||
      !['/home', '/integration', '/integration/coverage'].includes(url.pathname)
    )
      return undefined;
    if (/%(?:5c|2f)/i.test(url.pathname)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}
export const recoverySearchFields = {
  category: recoveryCategorySchema.optional(),
  selected: z
    .string()
    .regex(/^r1_[A-Za-z0-9_-]{23}$/)
    .optional(),
  presentation: z
    .enum(['visible', 'hidden'])
    .transform((value) => (value === 'visible' ? undefined : value))
    .optional(),
  history: z
    .boolean()
    .transform((value) => (value ? true : undefined))
    .optional(),
  returnTo: z
    .string()
    .refine((value) => safeRecoveryReturnTo(value) !== undefined)
    .optional(),
  cursor: z.string().min(1).max(4096).optional(),
};
export interface RecoverySearch {
  managedSystem?: string;
  category?: z.infer<typeof recoveryCategorySchema>;
  selected?: string;
  presentation?: 'hidden';
  history?: boolean;
  returnTo?: string;
  cursor?: string;
}
