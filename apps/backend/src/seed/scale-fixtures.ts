// Throwaway preview databases only. One atomic transaction covers the entire cohort
// and its completion marker. Stable UUIDs and per-group deduplication also repair a
// partial cohort when its marker is absent. No audit, Survey or test-support writes.
// Set-based inserts allocate display IDs in SQL only for missing rows; ~10k domain
// rows plus links should fit the 90s target (timing requires the conductor's DB run).
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';

function stableUuid(workspace: string, label: string): string {
  const chars = createHash('sha1')
    .update(`fops-preview-scale:${workspace}:${label}`)
    .digest('hex')
    .split('');
  chars[12] = '5';
  chars[16] = '8';
  return [
    chars.slice(0, 8),
    chars.slice(8, 12),
    chars.slice(12, 16),
    chars.slice(16, 20),
    chars.slice(20, 32),
  ]
    .map((part) => part.join(''))
    .join('-');
}

const TITLES = [
  '필터 조건이 저장되지 않습니다',
  '조회 시간이 길어집니다',
  '권한 신청 경로를 찾기 어렵습니다',
  '새로 고침 결과가 늦게 반영됩니다',
  '내보낸 파일의 열 순서가 다릅니다',
  '날짜 범위를 다시 설정해야 합니다',
  '담당자 안내가 필요합니다',
  '검색 결과에서 항목이 누락됩니다',
  '지표 설명을 확인하고 싶습니다',
  '목록 정렬이 초기화됩니다',
  '접근 권한 만료 안내가 필요합니다',
  '대시보드 이름을 구분하기 어렵습니다',
  '사용 현황 집계 기준을 알려 주세요',
  '즐겨찾기 위치를 유지해 주세요',
  '표의 숫자 형식이 다릅니다',
  '오류 안내에 해결 방법이 필요합니다',
  '중복 항목을 정리해 주세요',
  '팀별 조회 조건이 필요합니다',
  '알림 수신 범위를 조정하고 싶습니다',
  '업데이트 시간을 표시해 주세요',
  '모바일 화면에서 표가 잘립니다',
  '다운로드 진행 상태를 알고 싶습니다',
  '비교 기간을 추가해 주세요',
  '담당 팀을 쉽게 찾고 싶습니다',
  '데이터 기준일을 확인하고 싶습니다',
  '공유 링크의 접근 안내가 필요합니다',
  '필터 선택을 취소하기 어렵습니다',
  '메뉴 설명을 보완해 주세요',
  '작업 완료 여부를 확인하고 싶습니다',
  '조회 결과의 단위를 표시해 주세요',
];
type Row = {
  id: string;
  workspace_id: string;
  primary_managed_system_id: string;
  created_at: string;
  updated_at: string;
};

export async function seedPreviewScale(handle: DbHandle, workspaceId: string): Promise<void> {
  await handle.db.transaction(async (tx) => {
    // Serializes concurrent invocations for this workspace, including marker lookup.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`fops-preview-scale:${workspaceId}`}, 0))`,
    );
    const markerId = stableUuid(workspaceId, 'complete');
    const marker = await tx.execute(sql`select id from core.actors where workspace_id=${workspaceId}
      and external_id='fops-preview-scale-complete'`);
    if (marker.rows.length) {
      console.info('[preview-scale] completed cohort already present; skipping');
      return;
    }
    const actorRows = await tx.execute(
      sql`select id, external_id from core.actors where workspace_id=${workspaceId}`,
    );
    const actor = new Map(actorRows.rows.map((r) => [String(r.external_id), String(r.id)]));
    const requireActor = (external: string) => {
      const id = actor.get(external);
      if (!id) throw new Error(`Scale seed requires actor ${external}`);
      return id;
    };
    const admin = requireActor('mock-admin-1');
    const systems = await tx.execute(sql`select id, slug, name from core.managed_systems
      where workspace_id=${workspaceId} and slug in ('tableau','power-bi') and archived_at is null`);
    const areas = await tx.execute(sql`select id, managed_system_id, name from core.analytics_areas
      where workspace_id=${workspaceId} and archived_at is null order by slug`);
    const system = (n: number) => {
      const slug = n % 5 < 3 ? 'tableau' : 'power-bi';
      const row = systems.rows.find((s) => s.slug === slug);
      if (!row) throw new Error(`Scale seed requires Managed System ${slug}`);
      return { id: String(row.id), name: String(row.name), slug };
    };
    const now = Date.now();
    const base = (kind: string, n: number, total: number): Row => {
      // Mild recent density: ~187/month and ~12/day at 5k, spanning five years.
      const created = new Date(
        now - 3600_000 - (n / total) ** 1.25 * 5 * 365 * 86400_000,
      ).toISOString();
      return {
        id: stableUuid(workspaceId, `${kind}-${n}`),
        workspace_id: workspaceId,
        primary_managed_system_id: system(n).id,
        created_at: created,
        updated_at: created,
      };
    };
    const context = (n: number) => {
      const ms = system(n);
      const candidates = areas.rows.filter((a) => a.managed_system_id === ms.id);
      const area = candidates[Math.floor(n / 5) % (candidates.length + 1)];
      return {
        analytics_area_id: area?.id ?? null,
        noun: `${ms.name} ${area?.name ?? '공통 업무'}`,
      };
    };
    // Table/column names are fixed seed-owned constants, never user input.
    const insert = async (table: string, rows: Record<string, unknown>[], entity?: string) => {
      if (!rows.length) return;
      const columns = Object.keys(rows[0] ?? {});
      const display = entity ? ', display_id' : '';
      const allocate =
        entity === 'voc'
          ? sql`voc.next_voc_display_id(${workspaceId}::uuid)`
          : sql`core.next_display_id(${workspaceId}::uuid, ${entity ?? ''})`;
      await tx.execute(sql`insert into ${sql.raw(table)} (${sql.raw(columns.join(','))}${sql.raw(display)})
        select ${sql.raw(columns.map((c) => `r.${c}`).join(','))}${entity ? sql`, ${allocate}` : sql``}
        from jsonb_populate_recordset(null::${sql.raw(table)}, ${JSON.stringify(rows)}::jsonb) r
        where not exists (select 1 from ${sql.raw(table)} old where old.id=r.id)
        on conflict (id) do nothing`);
    };
    const reporters = Array.from({ length: 40 }, (_, i) => ({
      id: stableUuid(workspaceId, `reporter-${i}`),
      workspace_id: workspaceId,
      external_id: `fops-preview-scale-reporter-${i}`,
      email: `preview-${i}@feedbackops.local`,
      display_name: `미리보기 제보자 ${i + 1}`,
      role_level: 'user',
      actor_type: 'internal_member',
      created_at: new Date(now - (i + 1) * 30 * 86400_000).toISOString(),
      updated_at: new Date(now - (i + 1) * 30 * 86400_000).toISOString(),
    }));
    await insert('core.actors', reporters);
    const reporterIds = [
      requireActor('mock-user-1'),
      requireActor('mock-user-2'),
      ...reporters.map((r) => r.id),
    ];
    const vocs = Array.from({ length: 5000 }, (_, n) => {
      const c = context(n);
      return {
        ...base('voc', n, 4999),
        analytics_area_id: c.analytics_area_id,
        reporter_id: reporterIds[n % reporterIds.length],
        title: `${c.noun}: ${TITLES[n % TITLES.length]} · 사례 ${n + 1}`,
        description_rich_content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `${c.noun} 업무 중 반복적으로 불편을 겪고 있습니다. 조회 조건과 처리 결과를 확인하고 개선해 주세요.`,
                },
              ],
            },
          ],
        },
        severity:
          n % 500 === 0 ? 'critical' : n % 10 === 0 ? 'high' : n % 3 === 0 ? 'low' : 'medium',
        triage_state: n < 150 ? 'untriaged' : n % 17 === 0 ? 'needs_more_information' : 'triaged',
        reporter_facing_status:
          n < 150
            ? 'received'
            : n % 17 === 0
              ? 'reviewing'
              : n < 300
                ? 'progress'
                : n % 2
                  ? 'closed'
                  : 'resolved',
        source_context: [
          'direct_use',
          'proxy_report',
          'operational_discovery',
          'stakeholder_request',
        ][n % 4],
      };
    });
    await insert('voc.vocs', vocs, 'voc');
    const sameSystem = <T extends Row>(rows: T[], ms: string, index: number): T => {
      const candidates = rows.filter((r) => r.primary_managed_system_id === ms);
      const row = candidates[index % candidates.length];
      if (!row) throw new Error('Missing same-system scale prerequisite');
      return row;
    };
    const latest = (...dates: string[]) => dates.reduce((a, b) => (a > b ? a : b));
    // Pick the closest older source in the same system to retain historical spread.
    // At the oldest edge a system may have no older row; the dependent follows it.
    const origin = <T extends Row>(rows: T[], dependent: Row): T => {
      const candidates = rows
        .filter((r) => r.primary_managed_system_id === dependent.primary_managed_system_id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const row = candidates.find((r) => r.created_at <= dependent.created_at) ?? candidates.at(-1);
      if (!row) throw new Error('Missing chronological scale prerequisite');
      return row;
    };
    const findingEvidence = new Map<string, typeof vocs>();
    const findings = Array.from({ length: 300 }, (_, n) => {
      const b = base('finding', n, 299);
      const source = origin(vocs, b);
      const candidates = vocs.filter(
        (v) => v.primary_managed_system_id === b.primary_managed_system_id,
      );
      const count = 2 + (n % 14);
      const start = Math.min(
        candidates.findIndex((v) => v.id === source.id),
        candidates.length - count,
      );
      const evidence = candidates.slice(start, start + count);
      findingEvidence.set(b.id, evidence);
      b.created_at = b.updated_at = latest(b.created_at, ...evidence.map((v) => v.created_at));
      return {
        ...b,
        analytics_area_id: context(n).analytics_area_id,
        title: `${context(n).noun}: 반복 불편 분석 ${n + 1}`,
        summary: '반복 제보를 분석하여 개선 범위와 기대 효과를 정리했습니다.',
        source_type: 'voc',
        source_id: source.id,
        evidence_count: 2 + (n % 14),
        severity: ['low', 'medium', 'high', 'critical'][n % 4],
        status: ['draft', 'active', 'not_actionable', 'archived'][n % 4],
        created_by: admin,
      };
    });
    await insert('finding.findings', findings, 'finding');
    const highlights = findings.flatMap((finding) => {
      const evidence = findingEvidence.get(finding.id);
      if (!evidence) throw new Error('Missing scale Finding evidence');
      return evidence.map((voc) => ({
        id: stableUuid(workspaceId, `finding-evidence-highlight:${finding.id}:${voc.id}`),
        workspace_id: workspaceId,
        finding_id: finding.id,
        primary_managed_system_id: finding.primary_managed_system_id,
        source_type: 'voc',
        source_id: voc.id,
        approved_excerpt_id: null,
        quote_or_summary: voc.title,
        analytics_area_id: null,
        sentiment: null,
        importance: null,
        created_by: admin,
      }));
    });
    await insert('finding.evidence_highlights', highlights);
    const clusters = Array.from({ length: 60 }, (_, n) => ({
      ...base('cluster', n, 59),
      title: `${context(n).noun}: 유사 제보 묶음 ${n + 1}`,
      summary: '같은 업무에서 발생한 유사 제보를 모았습니다.',
      status: n % 2 ? 'confirmed' : 'draft',
      created_by: admin,
      confirmed_by: n % 2 ? admin : null,
      confirmed_at: n % 2 ? base('cluster', n, 59).created_at : null,
    }));
    await insert('voc_cluster.voc_clusters', clusters, 'cluster');
    const milestones = Array.from({ length: 25 }, (_, n) => {
      const b = base('milestone', n, 24);
      const start = new Date(String(b.created_at));
      return {
        ...b,
        analytics_area_id: context(n).analytics_area_id,
        title: `${context(n).noun}: 개선 계획 ${n + 1}`,
        why: '반복되는 업무 불편을 줄이고 데이터 활용을 안정화합니다.',
        owner_actor_id: admin,
        created_by: admin,
        status: ['planning', 'in_progress', 'blocked', 'released'][n % 4],
        start_date: start.toISOString().slice(0, 10),
        target_date: new Date(start.getTime() + 90 * 86400_000).toISOString().slice(0, 10),
      };
    });
    await insert('task.milestones', milestones, 'milestone');
    const requests = Array.from({ length: 250 }, (_, n) => {
      const b = base('request', n, 249);
      const sourceType = ['voc', 'voc_cluster', 'finding'][n % 3] ?? 'voc';
      const sources = sourceType === 'voc' ? vocs : sourceType === 'finding' ? findings : clusters;
      // One historical conversion deliberately retains a pending reporter update.
      const candidates =
        n === 111 ? vocs.filter((v) => v.triage_state === 'needs_more_information') : sources;
      const source = origin<Row>(candidates, b);
      b.created_at = b.updated_at = latest(b.created_at, source.created_at);
      return {
        ...b,
        source_type: sourceType,
        source_id: source.id,
        evidence_summary: '여러 제보에서 동일한 업무 불편이 확인되었습니다.',
        requested_outcome: '원인을 개선하고 처리 결과를 공유해 주세요.',
        requester_actor_id: admin,
        status: ['pending_review', 'approved', 'rejected', 'converted'][n % 4],
        assigned_reviewer_actor_id: requireActor('mock-admin-2'),
        reviewer_actor_id: n % 4 ? requireActor('mock-admin-2') : null,
        decision_reason: n % 4 ? '증거와 개선 범위를 검토했습니다.' : null,
        decided_at: n % 4 ? b.created_at : null,
      };
    });
    await insert('task_request.task_requests', requests, 'task_request');
    const converted = requests.filter((r) => r.status === 'converted');
    // Spread conversions across the full Task history, including Done/Released.
    const taskRequests = new Map(
      converted.map((r) => [Math.round((requests.indexOf(r) / 249) * 4999), r]),
    );
    const tasks = Array.from({ length: 5000 }, (_, n) => {
      const b = base('task', n, 4999);
      // Converted requests each receive exactly one Task, in their own system.
      const request = taskRequests.get(n);
      if (request) b.created_at = b.updated_at = latest(b.created_at, request.created_at);
      const ms = request?.primary_managed_system_id ?? b.primary_managed_system_id;
      const assignees = [
        requireActor(ms === system(0).id ? 'mock-developer-1' : 'mock-developer-2'),
        admin,
        requireActor('mock-admin-2'),
        null,
      ];
      return {
        ...b,
        primary_managed_system_id: ms,
        analytics_area_id: request ? null : context(n).analytics_area_id,
        title: `${request ? '검토 완료 요청' : context(n).noun}: 개선 작업 ${n + 1}`,
        status:
          n < 300
            ? ['backlog', 'todo', 'doing', 'review', 'reopened'][n % 5]
            : n % 2
              ? 'done'
              : 'released',
        priority: ['low', 'medium', 'high', 'urgent'][n % 4],
        assignee_actor_id: assignees[Math.floor(n / 5) % 4],
        milestone_id: n % 4 ? sameSystem(milestones, ms, n).id : null,
        source_task_request_id: request?.id ?? null,
        created_by: admin,
      };
    });
    await insert('task.tasks', tasks, 'task');
    const members = clusters.flatMap((c, n) =>
      Array.from({ length: 3 + (n % 18) }, (_, k) => {
        const voc = sameSystem(vocs, c.primary_managed_system_id, n * 20 + k);
        return {
          cluster_id: c.id,
          voc_id: voc.id,
          added_by: admin,
          added_at: latest(c.created_at, voc.created_at),
        };
      }),
    );
    await tx.execute(sql`insert into voc_cluster.voc_cluster_members(cluster_id,voc_id,added_by,added_at)
      select r.cluster_id,r.voc_id,r.added_by,r.added_at from jsonb_to_recordset(${JSON.stringify(members)}::jsonb)
      r(cluster_id uuid,voc_id uuid,added_by uuid,added_at timestamptz) on conflict (cluster_id,voc_id) do nothing`);
    const entities = new Map(
      [...vocs, ...findings, ...clusters, ...requests, ...tasks].map((r) => [r.id, r]),
    );
    const links: Record<string, unknown>[] = [];
    const link = (
      sourceType: string,
      sourceId: string,
      targetType: string,
      target: Row,
      relation: string,
    ) => {
      const source = entities.get(sourceId);
      if (!source) throw new Error('Missing scale link source');
      const created = latest(source.created_at, target.created_at);
      links.push({
        id: stableUuid(workspaceId, `link:${sourceId}:${target.id}:${relation}`),
        workspace_id: workspaceId,
        source_type: sourceType,
        source_id: sourceId,
        target_type: targetType,
        target_id: target.id,
        relation_type: relation,
        managed_system_id: target.primary_managed_system_id,
        created_by: admin,
        visibility:
          targetType === 'task' && sourceType === 'voc' ? 'summary_visible' : 'internal_only',
        created_at: created,
        updated_at: created,
      });
    };
    const evidence = (f: (typeof findings)[number]) => {
      const rows = findingEvidence.get(f.id);
      if (!rows) throw new Error('Missing scale Finding evidence');
      return rows;
    };
    for (const f of findings) {
      link('voc', f.source_id, 'finding', f, 'created_finding');
      for (const v of evidence(f)) link('voc', v.id, 'finding', f, 'evidence_of');
    }
    for (const r of requests) {
      link(r.source_type, r.source_id, 'task_request', r, 'requested_task');
    }
    for (const t of tasks.filter((t) => t.source_task_request_id)) {
      const r = converted.find((r) => r.id === t.source_task_request_id);
      if (!r) throw new Error('Missing converted request');
      await tx.execute(sql`update task_request.task_requests
        set updated_at=greatest(updated_at, ${t.created_at}::timestamptz)
        where id=${r.id} and workspace_id=${workspaceId}`);
      link('task_request', r.id, 'task', t, 'converted_to');
      if (r.source_type === 'voc') link('voc', r.source_id, 'task', t, 'evidence_of');
      if (r.source_type === 'finding') {
        link('finding', r.source_id, 'task', t, 'requested_task');
        const f = findings.find((f) => f.id === r.source_id);
        if (!f) throw new Error('Missing converted Finding');
        for (const v of evidence(f)) link('voc', v.id, 'task', t, 'evidence_of');
        await tx.execute(sql`update finding.findings set status='converted', linked_task_id=${t.id},
          updated_at=greatest(updated_at, ${t.created_at}::timestamptz)
          where id=${f.id} and workspace_id=${workspaceId}`);
      }
    }
    // The view forbids ON CONFLICT inference. Deduplicate by the complete tuple.
    await tx.execute(sql`insert into core.entity_links_app
      (id,workspace_id,source_type,source_id,target_type,target_id,relation_type,managed_system_id,created_by,visibility,created_at,updated_at)
      select r.id,r.workspace_id,r.source_type,r.source_id,r.target_type,r.target_id,r.relation_type,
        r.managed_system_id,r.created_by,r.visibility,r.created_at,r.updated_at
      from jsonb_populate_recordset(null::core.entity_links_app, ${JSON.stringify(links)}::jsonb) r
      where not exists (select 1 from core.entity_links_app old where old.workspace_id=r.workspace_id
        and old.source_type=r.source_type and old.source_id=r.source_id and old.target_type=r.target_type
        and old.target_id=r.target_id and old.relation_type=r.relation_type)`);
    await insert('core.actors', [
      {
        id: markerId,
        workspace_id: workspaceId,
        external_id: 'fops-preview-scale-complete',
        email: 'preview-scale-complete@feedbackops.local',
        display_name: 'Preview scale completion marker',
        role_level: 'user',
        actor_type: 'system',
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      },
    ]);
    console.info(
      '[preview-scale] cohort complete: 5000 VOCs, 5000 Tasks, 300 Findings, 250 Task Requests, 60 Clusters, 25 Milestones',
    );
  });
}
