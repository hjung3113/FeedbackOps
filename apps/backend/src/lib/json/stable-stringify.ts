// Recursive sorted-key JSON serializer for deterministic SHA-256 input.
// Arrays preserve order (TipTap doc semantics depend on node sequence).
// Primitives (string, number, boolean, null, undefined) delegate to
// JSON.stringify so NaN/Infinity/undefined edge cases are handled
// consistently with the standard library.

export function stableStringify(v: unknown): string {
  if (v === null || v === undefined) {
    return JSON.stringify(v) ?? 'null';
  }
  if (Array.isArray(v)) {
    const items = v.map((item) => stableStringify(item));
    return `[${items.join(',')}]`;
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${pairs.join(',')}}`;
  }
  // primitives: string, number, boolean
  return JSON.stringify(v);
}
