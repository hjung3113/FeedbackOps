// Keep the previous page only when the next query differs by `q`.
// A Managed System, view, filter, or status change must show the loading
// state. An errored previous query is not reused, including after a later
// key change: placeholderData receives the last query that had data.

import { hashKey } from '@tanstack/react-query';

type PreviousSearchQuery = {
  queryKey: readonly unknown[];
  state: { status: string };
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Query key with `q` removed. A segment that held only `q` is dropped so a
 * board key that omits `{ q }` matches one that includes it. */
function scopeKey(queryKey: readonly unknown[]): unknown[] {
  const parts: unknown[] = [];
  for (const part of queryKey) {
    if (!isPlainRecord(part)) {
      parts.push(part);
      continue;
    }
    const rest: Record<string, unknown> = {};
    for (const key of Object.keys(part)) {
      if (key === 'q' || part[key] === undefined) continue;
      rest[key] = part[key];
    }
    if (Object.keys(rest).length > 0) parts.push(rest);
  }
  return parts;
}

export function placeholderDataForSearchOnly<TData>(
  nextQueryKey: readonly unknown[],
  previousData: TData | undefined,
  previousQuery: PreviousSearchQuery | undefined,
): TData | undefined {
  if (previousData === undefined || previousQuery === undefined) return undefined;
  if (previousQuery.state.status === 'error') return undefined;
  if (hashKey(scopeKey(previousQuery.queryKey)) !== hashKey(scopeKey(nextQueryKey))) {
    return undefined;
  }
  return previousData;
}
