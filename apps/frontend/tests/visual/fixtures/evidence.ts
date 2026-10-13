import {
  getEvidenceInventoryResponseSchema,
  listEvidenceInventoryResponseSchema,
} from '@fops/shared';

export type EvidenceVisualScenario =
  | 'normal'
  | 'withheld'
  | 'empty'
  | 'error'
  | 'scoped-search-empty';
export const EVIDENCE_VISUAL_ID = 'a1111111-1111-4111-8111-111111111111';
const base = {
  id: EVIDENCE_VISUAL_ID,
  finding_id: 'b2222222-2222-4222-8222-222222222222',
  primary_managed_system_id: 'c3333333-3333-4333-8333-333333333333',
  analytics_area_id: null,
  sentiment: 'negative',
  importance: 'high',
  created_at: '2026-07-01T00:00:00.000Z',
  finding: {
    id: 'b2222222-2222-4222-8222-222222222222',
    display_id: 'FIN-42',
    title: '월간 리포트 다운로드 실패',
  },
  source_type: 'survey_response',
};
export const evidenceVisualItem = getEvidenceInventoryResponseSchema.parse({
  ...base,
  content_state: 'available',
  quote_or_summary: `월간 리포트 다운로드가 느려지고 실패해도 안내가 없습니다.\n\n${Array.from({ length: 18 }, (_, index) => `점검 ${index + 1}: 다운로드 진행 상태와 실패 안내를 확인하기 어렵습니다. 리포트 사용 중 반복된 경험을 기록합니다.`).join('\n\n')}`,
  source: {
    survey_type: 'validation',
    survey_display_id: 'SRV-21',
    question_label: '다운로드 경험',
    identity_protected: true,
  },
});
export const evidenceWithheldItem = getEvidenceInventoryResponseSchema.parse({
  ...base,
  content_state: 'withheld',
});
/** A different-source row the widened all-source search returns for the same query. */
export const evidenceVisualNoteItem = getEvidenceInventoryResponseSchema.parse({
  ...base,
  source_type: 'note',
  content_state: 'available',
  quote_or_summary: '다운로드 실패는 월간 리포트 생성 지연과 함께 반복되었습니다.',
});
export function evidenceVisualList(scenario: EvidenceVisualScenario = 'normal') {
  return listEvidenceInventoryResponseSchema.parse({
    items:
      scenario === 'empty'
        ? []
        : scenario === 'withheld'
          ? [evidenceWithheldItem]
          : Array.from({ length: 30 }, (_, index) => ({
              ...evidenceVisualItem,
              created_at: new Date(
                Date.parse('2026-07-01T00:00:00.000Z') - index * 86400000,
              ).toISOString(),
              id:
                index === 0
                  ? EVIDENCE_VISUAL_ID
                  : `d4444444-4444-4444-8444-${String(index).padStart(12, '0')}`,
              quote_or_summary:
                index === 0
                  ? evidenceVisualItem.quote_or_summary
                  : `리포트 사용성 점검 메모 ${index}`,
            })),
    page: { has_more: false },
  });
}
