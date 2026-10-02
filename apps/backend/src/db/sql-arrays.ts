import { sql } from 'drizzle-orm';

// Drizzle's sql`` tag serializes JavaScript arrays as PostgreSQL row/record
// literals, so build typed arrays from individual parameterized values.
export function sqlUuidArray(ids: readonly string[]): ReturnType<typeof sql> {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  const items = ids.map((id) => sql`${id}::uuid`);
  return sql`ARRAY[${sql.join(items, sql`, `)}]::uuid[]`;
}

export function sqlTextArray(values: readonly string[]): ReturnType<typeof sql> {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  const items = values.map((value) => sql`${value}::text`);
  return sql`ARRAY[${sql.join(items, sql`, `)}]::text[]`;
}
