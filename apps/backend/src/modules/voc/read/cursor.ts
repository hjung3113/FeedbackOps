// VOC conversation cursor encoding and validation.
import { z } from 'zod';

import { HttpError } from '../../../lib/errors.js';

// ── Inline conversation cursor (conversation-specific; separate from VOC list cursor) ──

interface ConversationCursor {
  createdAt: string;
  id: string;
}

export function encodeConversationCursor(c: ConversationCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64');
}

// WHY (M5): zod schema validates cursor field types (not just presence) to
// prevent malformed UUID/datetime strings from reaching SQL and causing 500s.
// offset: true allows both Z and +HH:MM suffixes (postgres text → ISO conversion
// produces +00:00 which requires this option).
const conversationCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true, message: 'createdAt must be an ISO datetime' }),
  id: z.string().uuid({ message: 'id must be a UUID' }),
});

export function decodeConversationCursor(raw: string): ConversationCursor {
  const fail = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  let json: string;
  try {
    json = Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    throw fail();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw fail();
  }
  // WHY (M5): validate field types, not just presence — malformed dates/UUIDs
  // would reach SQL and cause 500 errors on the timestamptz/uuid casts.
  const result = conversationCursorSchema.safeParse(parsed);
  if (!result.success) {
    throw fail();
  }
  return result.data;
}
