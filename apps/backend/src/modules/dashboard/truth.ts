import { sql } from 'drizzle-orm';
import { readRecoveryDependencies } from '../entity-links/commands.js';
import { findingRecoveryProjection } from '../findings/recovery-read.js';
import { permissionRecoveryTruth } from '../permissions/recovery-read.js';
import { readSurveyRecoveryDependencies, surveyRecoveryTruth } from '../surveys/recovery-read.js';
import { taskRecoveryProjection } from '../tasks/recovery-read.js';
import { readClusterRecoveryMembers } from '../voc-clusters/recovery-read.js';
import { vocRecoveryProjection } from '../voc/recovery-read.js';
import {
  type RecoveryTruth,
  type RecoveryTruthReaders,
  createRecoveryRecorder,
} from './recorder.js';

const all = { kind: 'all' as const };
export const ownerRecoveryTruthReaders: RecoveryTruthReaders = {
  async dependencies(tx, workspaceId, subjects) {
    const members = await readClusterRecoveryMembers(
      tx,
      workspaceId,
      subjects.filter((s) => s.type === 'voc_cluster').map((s) => s.id),
    );
    const ordinary = await readRecoveryDependencies(tx, workspaceId, [...subjects, ...members]);
    return [
      ...members,
      ...ordinary,
      ...(await readSurveyRecoveryDependencies(tx, workspaceId, [...subjects, ...ordinary])),
    ];
  },
  async read(tx, workspaceId, subjects) {
    if (subjects.length === 0) return [];
    const queries = subjects
      .filter(
        (s) =>
          s.type !== 'task_request' && s.type !== 'voc_cluster' && s.type !== 'survey_response',
      )
      .flatMap((s) => {
        if (s.type === 'voc')
          return (['unassigned-voc', 'high-severity-unlinked'] as const).map(
            (category) =>
              sql`SELECT ${category}::text AS category,source_id,system_id,active,withdrawn FROM (${vocRecoveryProjection(workspaceId, all, category, all, s.id)}) source`,
          );
        const category =
          s.type === 'finding'
            ? 'actionable-finding-no-execution'
            : s.type === 'task'
              ? 'released-task-unresolved-voc'
              : s.type === 'survey'
                ? 'bad-outcome-no-followup'
                : 'permission-requests-pending';
        const projection =
          s.type === 'finding'
            ? findingRecoveryProjection(workspaceId, all, all, s.id)
            : s.type === 'task'
              ? taskRecoveryProjection({
                  workspaceId,
                  scope: all,
                  vocReadScope: all,
                  vocRepairScope: all,
                  actorId: '00000000-0000-4000-8000-000000000000',
                  roleLevel: 'admin',
                  sourceId: s.id,
                })
              : s.type === 'survey'
                ? surveyRecoveryTruth(workspaceId, s.id)
                : permissionRecoveryTruth(workspaceId, s.id);
        return [
          sql`SELECT ${category}::text AS category,source_id,system_id,active,withdrawn FROM (${projection}) source`,
        ];
      });
    if (queries.length === 0) return [];
    return (await tx.execute<RecoveryTruth>(sql.join(queries, sql` UNION ALL `))).rows;
  },
};
export const createOwnerRecoveryRecorder = () => createRecoveryRecorder(ownerRecoveryTruthReaders);

export async function readRecoveryDiscoveryPage(
  tx: import('../../db/tx.js').Tx,
  workspaceId: string,
  after?: { category: string; sourceId: string },
  limit = 100,
) {
  const projections = [
    ['unassigned-voc', vocRecoveryProjection(workspaceId, all, 'unassigned-voc', all)],
    [
      'high-severity-unlinked',
      vocRecoveryProjection(workspaceId, all, 'high-severity-unlinked', all),
    ],
    ['actionable-finding-no-execution', findingRecoveryProjection(workspaceId, all, all)],
    [
      'released-task-unresolved-voc',
      taskRecoveryProjection({
        workspaceId,
        scope: all,
        vocReadScope: all,
        vocRepairScope: all,
        actorId: '00000000-0000-4000-8000-000000000000',
        roleLevel: 'admin',
      }),
    ],
    ['bad-outcome-no-followup', surveyRecoveryTruth(workspaceId)],
    ['permission-requests-pending', permissionRecoveryTruth(workspaceId)],
  ] as const;
  const union = sql.join(
    projections.map(
      ([category, query]) =>
        sql`SELECT ${category}::text AS category,source_id FROM (${query}) source`,
    ),
    sql` UNION ALL `,
  );
  const rows = (
    await tx.execute<{ category: import('@fops/shared').RecoveryCategory; source_id: string }>(sql`
    SELECT * FROM (${union}) sources WHERE ${after ? sql`(category,source_id)>(${after.category}::text,${after.sourceId}::uuid)` : sql`true`}
    ORDER BY category,source_id LIMIT ${limit + 1}`)
  ).rows;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    subjects: page.map((r) => ({
      type:
        r.category === 'unassigned-voc' || r.category === 'high-severity-unlinked'
          ? ('voc' as const)
          : r.category === 'actionable-finding-no-execution'
            ? ('finding' as const)
            : r.category === 'released-task-unresolved-voc'
              ? ('task' as const)
              : r.category === 'bad-outcome-no-followup'
                ? ('survey' as const)
                : ('permission_request' as const),
      id: r.source_id,
    })),
    ...(rows.length > limit && last
      ? { next: { category: last.category, sourceId: last.source_id } }
      : {}),
  };
}
