import { z } from 'zod';

/** Keeps valid route-search fields and drops invalid or unrecognized URL values. */
export function parseRouteSearch<Schema extends z.AnyZodObject>(
  schema: Schema,
  raw: unknown,
): z.infer<Schema> {
  const source =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const candidate: Record<string, unknown> = {};

  const fields = Object.entries(schema.shape) as [string, z.ZodTypeAny][];
  for (const [key, fieldSchema] of fields) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    if (fieldSchema.safeParse(source[key]).success) candidate[key] = source[key];
  }

  while (true) {
    const result = schema.safeParse(candidate);
    if (result.success) return result.data;

    const fieldsToDrop = new Set(
      result.error.issues.flatMap((issue) => {
        const field = issue.path[0];
        return typeof field === 'string' && Object.prototype.hasOwnProperty.call(candidate, field)
          ? [field]
          : [];
      }),
    );
    if (fieldsToDrop.size === 0) {
      const defaults = schema.safeParse({});
      return defaults.success ? defaults.data : ({} as z.infer<Schema>);
    }
    for (const field of fieldsToDrop) delete candidate[field];
  }
}
