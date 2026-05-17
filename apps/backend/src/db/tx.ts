// Canonical transaction handle. Service code that performs mutations MUST
// accept `Tx` so it can be invoked inside an open transaction; passing the
// pool-backed `Db` here would silently break read-then-write atomicity
// (see S-002 / S-006 in .review/USER-VERIFICATION-CHECKLIST.md).

import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';

import * as core from './schema/core.js';
import * as permission from './schema/permission.js';
import type { Db } from './client.js';

const schema = { ...core, ...permission };

type Schema = typeof schema;
type TablesWithRelations = ExtractTablesWithRelations<Schema>;

export type DrizzleTx = PgTransaction<NodePgQueryResultHKT, Schema, TablesWithRelations>;

export type Tx = Db | DrizzleTx;
