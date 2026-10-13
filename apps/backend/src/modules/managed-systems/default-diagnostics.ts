import {
  type ManagedSystemDefaultDiagnostics,
  type ResponsibilityDefaultFailure,
  managedSystemDefaultDiagnosticsSchema,
  responsibilityDefaultFailureSchema,
} from '@fops/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { managedSystems, responsibilityDefaultFailures } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { CheckService } from '../permissions/check-service.js';
import { responsibilityTargetFailure } from './responsibility-target.js';

/** Called only after successful automatic resolution in the source command's transaction.
 * #1090/#1091 own production. Rollback/replay must not produce another failure input.
 */
export async function recordResponsibilityDefaultFailure(
  tx: Tx,
  input: ResponsibilityDefaultFailure,
): Promise<void> {
  const failure = responsibilityDefaultFailureSchema.parse(input);
  const [system] = await tx
    .select({ id: managedSystems.id })
    .from(managedSystems)
    .where(
      and(
        eq(managedSystems.id, failure.managed_system_id),
        eq(managedSystems.workspaceId, failure.workspace_id),
      ),
    )
    .limit(1)
    .for('share');
  if (!system) throw new HttpError('not_found.record', 'managed_system not found');
  await tx.insert(responsibilityDefaultFailures).values({
    workspaceId: failure.workspace_id,
    managedSystemId: failure.managed_system_id,
    workflow: failure.workflow,
    responsibility: failure.responsibility,
    rule: failure.rule,
    category: failure.category,
    // Evaluated after the registry share lock, preserving DB timestamp precision.
    createdAt: sql`clock_timestamp()`,
  });
}

/** Admin authorization is owned by the calling application service. GET writes nothing. */
export async function readDefaultDiagnostics(
  tx: Tx,
  checkService: CheckService,
  workspaceId: string,
): Promise<ManagedSystemDefaultDiagnostics> {
  const systems = await tx
    .select()
    .from(managedSystems)
    .where(and(eq(managedSystems.workspaceId, workspaceId), isNull(managedSystems.archivedAt)))
    .orderBy(asc(managedSystems.slug));
  const items: ManagedSystemDefaultDiagnostics['items'] = [];
  for (const system of systems) {
    for (const kind of ['owner', 'reviewer'] as const) {
      const category = await responsibilityTargetFailure(
        tx,
        checkService,
        workspaceId,
        system.id,
        kind,
        kind === 'owner' ? system.defaultOwnerActorId : system.defaultReviewerActorId,
        kind === 'owner' ? system.defaultOwnerTeamId : system.defaultReviewerTeamId,
      );
      // A missing reviewer is intentional when an eligible owner can review.
      if (kind === 'reviewer' && category === 'missing') {
        const fallback = await responsibilityTargetFailure(
          tx,
          checkService,
          workspaceId,
          system.id,
          'reviewer',
          system.defaultOwnerActorId,
          system.defaultOwnerTeamId,
        );
        if (!fallback) continue;
      }
      if (category)
        items.push({
          managed_system_id: system.id,
          workflow: kind === 'owner' ? 'voc' : 'task_request',
          responsibility: kind,
          rule: kind === 'owner' ? 'managed_system_owner' : 'managed_system_reviewer',
          category,
          origin: 'configuration',
          count: 1,
          last_failed_at: null,
        });
    }
  }
  const failures = await tx.execute(sql`
    SELECT f.managed_system_id, f.workflow, f.responsibility, f.rule, f.category,
      count(*)::int AS count, max(f.created_at) AS last_failed_at
    FROM ${responsibilityDefaultFailures} f
    JOIN ${managedSystems} m ON m.id = f.managed_system_id AND m.workspace_id = f.workspace_id
    WHERE f.workspace_id = ${workspaceId} AND m.archived_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM core.responsibility_configuration_changes(${workspaceId}::uuid) a
      WHERE a.managed_system_id = m.id AND a.changed_at >= f.created_at
        AND a.responsibility = f.responsibility
    )
    GROUP BY f.managed_system_id, f.workflow, f.responsibility, f.rule, f.category
    ORDER BY f.managed_system_id, f.workflow, f.responsibility, f.rule, f.category
  `);
  for (const row of failures.rows) {
    items.push(
      managedSystemDefaultDiagnosticsSchema.shape.items.element.parse({
        ...row,
        origin: 'creation_failure',
        last_failed_at: new Date(row.last_failed_at as string).toISOString(),
      }),
    );
  }
  return managedSystemDefaultDiagnosticsSchema.parse({ items });
}
