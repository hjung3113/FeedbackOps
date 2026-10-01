import { describe, expect, it } from 'vitest';

import { CREATE_OR_LINK_FINDING_LABEL, GLOSSARY, createLabel, openLabel } from '../glossary';

// #679 guard: the shared chrome glossary must keep its closed set of entries so
// screens can rely on these constants instead of re-inventing strings.
describe('lib/copy/glossary', () => {
  it('exposes the policy glossary entries', () => {
    expect(GLOSSARY.filter).toBe('필터');
    expect(GLOSSARY.sort).toBe('정렬');
    expect(GLOSSARY.refresh).toBe('새로고침');
    expect(GLOSSARY.save).toBe('저장');
    expect(GLOSSARY.inbox).toBe('수신함');
    expect(GLOSSARY.myVocs).toBe('내 VOC');
    expect(GLOSSARY.entityLinks).toBe('엔티티 링크');
    expect(GLOSSARY.permissionRequests).toBe('권한 요청');
    expect(GLOSSARY.coverage).toBe('커버리지');
    expect(GLOSSARY.untriaged).toBe('미분류');
    expect(GLOSSARY.unassigned).toBe('미배정');
    expect(GLOSSARY.noLink).toBe('연결 없음');
    expect(GLOSSARY.highNoLink).toBe('높음 · 연결 없음');
    expect(GLOSSARY.noTask).toBe('Task 없음');
    expect(GLOSSARY.linkedVoc).toBe('연결된 VOC');
    expect(GLOSSARY.linkedTask).toBe('연결된 Task');
    expect(GLOSSARY.requestedBy).toBe('요청자');
    expect(GLOSSARY.fromFinding).toBe('Finding에서');
    expect(GLOSSARY.reporterFacingStatus).toBe('공개 상태');
    expect(GLOSSARY.dismiss).toBe('기각');
    expect(GLOSSARY.dismissReason).toBe('기각 사유');
    expect(GLOSSARY.applyPublicUpdate).toBe('공개 업데이트 적용');
    expect(GLOSSARY.owner).toBe('담당자');
    expect(GLOSSARY.start).toBe('시작일');
    expect(GLOSSARY.target).toBe('목표일');
    expect(GLOSSARY.tasksInFlight).toBe('진행 중 Task');
    expect(GLOSSARY.whyThisMilestoneExists).toBe('이 Milestone의 목적');
    expect(GLOSSARY.milestoneStatusPlanning).toBe('계획 중');
    expect(GLOSSARY.milestoneStatusInProgress).toBe('진행 중');
    expect(GLOSSARY.milestoneStatusReleased).toBe('릴리스됨');
    expect(GLOSSARY.triageQueue).toBe('Triage 대기열');
    expect(GLOSSARY.unknownUser).toBe('알 수 없는 사용자');
    expect(GLOSSARY.evidenceHighlight).toBe('Evidence 하이라이트');
    expect(GLOSSARY.addEvidence).toBe('Evidence 추가');
  });

  it('formats templated patterns', () => {
    expect(openLabel('Finding')).toBe('Finding 열기');
    expect(createLabel('Milestone')).toBe('Milestone 생성');
    expect(CREATE_OR_LINK_FINDING_LABEL).toBe('Finding 생성');
  });
});
