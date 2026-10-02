import { DETAIL_SECTIONS as FINDING_SECTIONS } from '@/features/findings/components/FindingDetail/useFindingDetailController';
import { TASK_DETAIL_SECTIONS } from '@/features/tasks/components/TaskDetailPanel';
import { SECTIONS as MILESTONE_SECTIONS } from '@/features/tasks/components/milestone-detail/constants';
import { buildTaskRequestSections } from '@/features/tasks/routes/task-requests/TaskRequestPanel';
import { buildVocClusterDetailSections } from '@/features/voc-cluster/components/detail/VocClusterDetailPanel';
import { VOC_DETAIL_SECTIONS } from '@/features/voc/components/detail/FullDetailView';
import { describe, expect, it } from 'vitest';

const cases = [
  {
    panel: 'VOC',
    sections: VOC_DETAIL_SECTIONS,
    expected: [
      ['overview', '요약'],
      ['triage', 'Triage'],
      ['description', '설명'],
      ['trail', '이력'],
      ['conversation', '대화'],
      ['compose', '작성'],
    ],
  },
  {
    panel: 'Task Request',
    sections: buildTaskRequestSections(false, true),
    expected: [
      ['overview', '요약'],
      ['decision', '결정'],
      ['source', '출처'],
      ['properties', '속성'],
      ['audit', '이력'],
    ],
  },
  {
    panel: 'Task Request outcome',
    sections: buildTaskRequestSections(true, false),
    expected: [
      ['overview', '요약'],
      ['outcome', '결정 요약'],
      ['properties', '속성'],
      ['audit', '이력'],
    ],
  },
  {
    panel: 'Task',
    sections: TASK_DETAIL_SECTIONS,
    expected: [
      ['overview', '요약'],
      ['properties', '속성'],
      ['source', '출처'],
      ['context', '맥락'],
      ['notes', '진행 메모'],
    ],
  },
  {
    panel: 'Cluster',
    sections: buildVocClusterDetailSections(6),
    expected: [
      ['overview', '요약'],
      ['why', '근거'],
      ['execution', '실행'],
      ['members', '멤버'],
      ['properties', '속성'],
    ],
  },
  {
    panel: 'Milestone',
    sections: MILESTONE_SECTIONS,
    expected: [
      ['overview', '요약'],
      ['tasks', 'Tasks'],
      ['evidence', 'Evidence'],
      ['activity', '이력'],
    ],
  },
  {
    panel: 'Finding',
    sections: FINDING_SECTIONS,
    expected: [
      ['summary', '요약'],
      ['metadata', '소스/심각도/신뢰도'],
      ['evidence', 'Evidence'],
      ['managed-system', 'Managed System'],
      ['analytics-area', 'Analytics Area'],
      ['links', '연결'],
      ['notes', '진행 메모'],
    ],
  },
] satisfies Array<{
  panel: string;
  sections: Array<{ id: string; label: string }>;
  expected: Array<[string, string]>;
}>;

describe('detail panel section labels', () => {
  it.each(cases)('$panel keeps its approved label and anchor IDs', ({ sections, expected }) => {
    expect(sections.map(({ id, label }) => [id, label])).toEqual(expected);
  });
});
