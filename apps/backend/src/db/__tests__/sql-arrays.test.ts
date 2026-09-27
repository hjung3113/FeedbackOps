import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { sqlTextArray, sqlUuidArray } from '../sql-arrays.js';

const dialect = new PgDialect();

describe('parameterized SQL arrays', () => {
  it('builds a typed UUID array with bound parameters', () => {
    const query = dialect.sqlToQuery(
      sqlUuidArray([
        '11111111-2222-3333-4444-555555555555',
        '66666666-7777-8888-9999-000000000000',
      ]),
    );

    expect(query).toMatchObject({
      sql: 'ARRAY[$1::uuid, $2::uuid]::uuid[]',
      params: ['11111111-2222-3333-4444-555555555555', '66666666-7777-8888-9999-000000000000'],
    });
  });

  it('builds a typed text array with bound parameters', () => {
    const unsafeText = "status, ' OR true --";
    const query = dialect.sqlToQuery(sqlTextArray([unsafeText]));

    expect(query).toMatchObject({
      sql: 'ARRAY[$1::text]::text[]',
      params: [unsafeText],
    });
  });

  it('builds typed empty arrays without parameters', () => {
    expect(dialect.sqlToQuery(sqlUuidArray([]))).toMatchObject({
      sql: 'ARRAY[]::uuid[]',
      params: [],
    });
    expect(dialect.sqlToQuery(sqlTextArray([]))).toMatchObject({
      sql: 'ARRAY[]::text[]',
      params: [],
    });
  });
});
