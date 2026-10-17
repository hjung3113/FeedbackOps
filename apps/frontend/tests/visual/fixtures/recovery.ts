import { recoveryDetailSchema, recoveryHistorySchema, recoveryListSchema } from '@fops/shared';
export const RECOVERY_VISUAL_ID = 'r1_abcdefghijklmnopqrstuvw';
export type RecoveryVisualScenario =
  | 'queue'
  | 'active'
  | 'resolved'
  | 'hidden'
  | 'history'
  | 'empty';
export const RECOVERY_VISUAL_TIME = '2026-07-20T08:00:00.000Z';
export function recoveryVisualDetail(scenario: RecoveryVisualScenario = 'active') {
  return recoveryDetailSchema.parse({
    recovery_item_id: RECOVERY_VISUAL_ID,
    category: 'unassigned-voc',
    state: scenario === 'resolved' ? 'resolved' : 'active',
    occurrence: scenario === 'history' ? 2 : 1,
    presentation: { state: scenario === 'hidden' ? 'muted' : 'visible', snoozed_until: null },
    resolution:
      scenario === 'resolved'
        ? {
            resolved_at: '2026-07-20T08:00:00.123456Z',
            outcome: 'resolved',
            evidence: 'command',
            action: 'triage',
          }
        : null,
    reason_code: 'unassigned-voc',
    reason: 'VOC 담당자 배정이 필요합니다.',
    priority: 1,
    severity: 'warn',
    managed_system_id: '11111111-1111-4111-8111-111111111111',
    source: {
      type: 'voc',
      id: '22222222-2222-4222-8222-222222222222',
      display_id: 'VOC-42',
      title: '월간 리포트 다운로드 오류',
      route:
        '/vocs?selected=22222222-2222-4222-8222-222222222222&view=triage&managedSystem=11111111-1111-4111-8111-111111111111',
    },
    affected: [],
    next_actions:
      scenario === 'resolved'
        ? []
        : [
            {
              id: 'triage',
              label: 'VOC 담당자 배정',
              availability: 'available',
              blocked_reason: null,
              requestable_permission: null,
              target: {
                source_type: 'voc',
                source_id: '22222222-2222-4222-8222-222222222222',
                route:
                  '/vocs?selected=22222222-2222-4222-8222-222222222222&view=triage&managedSystem=11111111-1111-4111-8111-111111111111',
                endpoint: '/vocs/22222222-2222-4222-8222-222222222222',
                method: 'PATCH',
                intent: 'triage',
              },
              confirmation: {
                required: false,
                title: '',
                body: '',
                risk_level: 'low',
                reason_required: false,
                audit_event_intent: null,
              },
            },
          ],
    responsible_actor_hint: { kind: 'unassigned', label: '담당자 없음' },
    computed_at: RECOVERY_VISUAL_TIME,
  });
}
export function recoveryVisualList(scenario: RecoveryVisualScenario = 'empty') {
  const { computed_at, ...item } = recoveryVisualDetail(scenario);
  return recoveryListSchema.parse({
    computed_at,
    items: scenario === 'empty' ? [] : [item],
    total: scenario === 'empty' ? 0 : 1,
    visible_total: scenario === 'empty' || scenario === 'hidden' ? 0 : 1,
    hidden_total: scenario === 'hidden' ? 1 : 0,
    page: { has_more: false },
  });
}
export function recoveryVisualHistory() {
  const { computed_at, ...item } = recoveryVisualDetail('history');
  return recoveryHistorySchema.parse({
    computed_at,
    window_start: '2026-05-01T00:00:00.000Z',
    items: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        item,
        occurrence: 1,
        resolution: {
          resolved_at: '2026-07-20T08:00:00.123456Z',
          outcome: 'resolved',
          evidence: 'command',
          action: 'triage',
        },
      },
    ],
    total: 1,
    page: { has_more: false },
  });
}
