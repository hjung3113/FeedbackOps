// triage-compensation.ts — compensation order for the triage undo path
// (issue #481). Not a React hook: takes the QueryClient explicitly and does
// NOT import the legacy API client — all HTTP goes through
// lib/triage-transport.ts. The step order here is FIXED (design §2):
// fresh If-Match resolution → tagged refetch failure → compensating PATCH →
// restore ONLY after the PATCH resolves.
//
// REV-1 #4: use the FRESH updated_at from the first PATCH response as the
// If-Match for the compensating PATCH. The original snapshot.ifMatch
// (voc.updated_at at confirm time) is stale once the first PATCH commits
// — reusing it self-fails with conflict.stale_write.
//
// REV-3 Cluster Y: the API client resolves `undefined` for an empty 200
// body. A guard of `output !== null` then dereferenced `output.updated_at`,
// which threw for `undefined`. When fresh `updated_at` is absent from the
// PATCH response, refetch ['voc', vocId] and pull the fresh `updated_at` off
// the refreshed envelope instead of falling back to the stale snapshot
// baseline.

import type { QueryClient } from '@tanstack/react-query';
import { executeCompensatingPatch, getVocUpdatedAt } from './triage-transport';
import type { TriageOutput, TriageSnapshot } from './triage-types';

export async function runTriageCompensation(args: {
  queryClient: QueryClient;
  snapshot: TriageSnapshot;
  // useUndoableMutation types the output as TOutput | null, but an empty 200
  // body arrives as undefined at runtime — accept both (REV-3 Cluster Y).
  output: TriageOutput | null | undefined;
  restore: (vocId: string) => void;
}): Promise<void> {
  const { queryClient, snapshot, output, restore } = args;

  let freshUpdatedAt: string | undefined =
    output != null && typeof (output as { updated_at?: unknown }).updated_at === 'string'
      ? (output as { updated_at: string }).updated_at
      : undefined;

  if (freshUpdatedAt === undefined) {
    try {
      // Use refetchQueries with type:'all' so we refetch even when there's
      // no active observer (the detail panel may not be mounted while the
      // triage queue panel runs the undo). If the query has never been
      // populated, fall back to fetchQuery.
      await queryClient.refetchQueries({
        queryKey: ['voc', snapshot.vocId],
        type: 'all',
      });
      let fresh = queryClient.getQueryData<{ updated_at?: unknown }>(['voc', snapshot.vocId]);
      if (!fresh) {
        fresh = await queryClient.fetchQuery<{ updated_at?: unknown }>({
          queryKey: ['voc', snapshot.vocId],
          queryFn: ({ signal }) => getVocUpdatedAt(snapshot.vocId, signal),
        });
      }
      if (fresh && typeof fresh.updated_at === 'string') {
        freshUpdatedAt = fresh.updated_at;
      }
    } catch (refetchErr) {
      // REV-4 P1: Refetch itself failed (network, etc.). Do NOT fall through
      // to executeCompensatingPatch with a stale If-Match — that's a
      // guaranteed 409 and provides no value to the user. Tag the error so
      // onCompensateError can skip double-toasting (the hook toasts the
      // refetch copy), and throw so undoLast's .catch handler can reset the
      // hook state cleanly. No compensating PATCH, no restore.
      // Tag so onCompensateError can skip double-toasting.
      const tagged = Object.assign(
        refetchErr instanceof Error ? refetchErr : new Error(String(refetchErr)),
        { __refetchFailure: true as const },
      );
      throw tagged;
    }
  }

  // Fresh If-Match replaces ONLY snapshot.ifMatch on a shallow copy — the
  // prior severity/owner/AA values and wasConfirm are untouched, and the
  // original snapshot is never mutated in place (issue #481 risk 6).
  // A refetch that succeeded without a string updated_at intentionally falls
  // through to the stale snapshot.ifMatch — that 409 is pre-existing behavior,
  // not promoted to a refetch failure.
  const freshSnapshot: TriageSnapshot =
    freshUpdatedAt !== undefined ? { ...snapshot, ifMatch: freshUpdatedAt } : snapshot;
  await executeCompensatingPatch(freshSnapshot);
  // Re-insert into queue AFTER the compensating PATCH resolves — if the PATCH
  // throws, restore must not run (server still triaged/postponed).
  restore(snapshot.vocId);
}
