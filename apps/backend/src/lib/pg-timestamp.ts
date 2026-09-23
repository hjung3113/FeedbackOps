// WHY: input.createdAt is the raw postgres text cast (microsecond precision),
// not a JS Date's toISOString() (millisecond precision) — two comments in the
// same millisecond would otherwise collide on the cursor boundary and the
// second one would be silently skipped on the next page. Mirrors the
// _created_at_raw handling voc/repo-read.ts's selectConversationPage used to
// inline.
//
// Normalize the postgres text format to ISO 8601 so it validates against
// z.string().datetime() in decodeCommentCursor: swap the space separator for
// "T" and add a ":" to the zone offset ("...T...160586+09" -> "...+09:00",
// not just the "+00"-only regex selectConversationPage used to inline — this
// DB's default session timezone is UTC, but nothing pins it, so a "+00"-only
// regex would 422 every cursor the day that changes) (astra medium review,
// PR #449).
export function normalizePgTimestampToIso(raw: string): string {
  const isoLike = raw.replace(' ', 'T');
  const match = isoLike.match(/^(.*)([+-]\d{2})(:?(\d{2}))?$/);
  if (!match) return isoLike;
  const [, base, offsetHours, , offsetMinutes] = match;
  return `${base}${offsetHours}:${offsetMinutes ?? '00'}`;
}

export function encodeCommentCursor(input: { createdAt: string; id: string }): string {
  const createdAt = normalizePgTimestampToIso(input.createdAt);
  return Buffer.from(JSON.stringify({ createdAt, id: input.id }), 'utf8').toString('base64');
}
