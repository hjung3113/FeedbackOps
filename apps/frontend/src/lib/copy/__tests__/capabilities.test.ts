import { CAPABILITIES, type Capability } from '@fops/shared';
import { describe, expect, it } from 'vitest';

import { CAPABILITY_LABELS, getCapabilityDisplayLabel } from '../capabilities.js';

const EXPECTED_LABELS: Record<Capability, string> = {
  'workspace.read': '워크스페이스 전체 읽기',
  'workspace.admin': '워크스페이스 관리자 권한',
  'voc.triage': 'VOC Triage',
  'voc.read': 'VOC 조회',
  'finding.read': 'Finding 조회',
  'finding.manage': 'Finding 관리',
  'task_request.self_approve': '본인 Task Request 직접 승인',
  'survey.read': 'Survey 조회',
  'survey.manage': 'Survey 관리',
  'survey.read_personal_responses': '개인 응답 조회',
  'survey.export': 'Survey 데이터 내보내기',
};

describe('capability display copy', () => {
  it.each(CAPABILITIES)('provides the approved label for %s', (capability) => {
    expect(CAPABILITY_LABELS[capability]).toBe(EXPECTED_LABELS[capability]);
    expect(getCapabilityDisplayLabel(capability)).toBe(EXPECTED_LABELS[capability]);
  });

  it('uses a safe label for an unrecognized capability key', () => {
    expect(getCapabilityDisplayLabel('future.capability')).toBe('권한 요청');
  });
});
