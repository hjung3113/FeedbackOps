import type { VocPreSubmitPeersResponse } from '@fops/shared';

import type { Db } from '../../../db/client.js';
import { actorReadScope } from '../repo-read.js';

import { selectPreSubmitVocPeers } from './repo.js';

export interface PreSubmitVocPeersActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export function createPreSubmitVocPeersService(deps: { db: Db }) {
  async function list(args: {
    actor: PreSubmitVocPeersActor;
    managedSystemId: string;
  }): Promise<VocPreSubmitPeersResponse> {
    const readScope = await actorReadScope(deps.db, args.actor);
    const rows = await selectPreSubmitVocPeers(deps.db, {
      workspaceId: args.actor.workspace_id,
      managedSystemId: args.managedSystemId,
      actorId: args.actor.actor_id,
      readScope,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        display_id: row.display_id,
        title: row.title,
        // `db.execute` hands timestamptz back as a postgres text literal
        // ("2026-01-01 00:00:05+00"), not a Date, so this must normalise rather
        // than call toISOString() on the raw value. Same shape as `toDate` in
        // repo-read.ts. The wire contract is ISO-8601, which the shared
        // schema's z.string().datetime() enforces.
        created_at: (row.created_at instanceof Date
          ? row.created_at
          : new Date(row.created_at)
        ).toISOString(),
      })),
    };
  }

  return { list };
}

export type PreSubmitVocPeersService = ReturnType<typeof createPreSubmitVocPeersService>;
