// ReporterStatusChangeBlock.test.tsx — TDD RED
// C4.1: 7 tests — order, forbidden DOM disabled, forbidden Callout, gate Callout,
//        with-body preview, empty-body preview, 변경 예정 chip.
//
// Prototype ref: docs/design-prototype/screen-voc.jsx:537-655

import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReporterStatusChangeBlock } from '../ReporterStatusChangeBlock';
import type { VocDetailEnvelope } from '@fops/shared';

// ── Minimal VOC fixture ─────────────────────────────────────────────────────

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-uuid-1111',
  display_id: 'VOC-0001',
  title: '테스트 VOC 제목',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: 'actor-1',
  owner_user_id: null,
  owner_team_id: null,
  severity: null,
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  similar_count: 0,
  similar: { items: [] },
  attachments: [],
  attachment_count: 0,
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: {
    allowed: ['reviewing', 'assigned'],
    forbidden: { resolved: '결과 확인 전에 해결됨으로 바꿀 수 없습니다.' },
  },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
};

const OWNER = {
  id: 'actor-owner',
  display_name: '김담당',
  email: 'owner@feedbackops.local',
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ReporterStatusChangeBlock', () => {
  it('renders picker with current status first, then allowed, then forbidden (차단됨 suffix)', () => {
    render(
      <ReporterStatusChangeBlock
        voc={BASE_VOC}
        nextStatus="received"
        onChangeStatus={vi.fn()}
        draftDoc={null}
        owner={OWNER}
      />,
    );

    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option')) as HTMLOptionElement[];

    // First option is current status
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(options[0]!.value).toBe('received');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(options[0]!.textContent).toContain('(현재)');

    // Allowed statuses come next (before forbidden)
    const allowedValues = ['reviewing', 'assigned'];
    for (const v of allowedValues) {
      const opt = options.find((o) => o.value === v);
      expect(opt).toBeTruthy();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(opt!.disabled).toBe(false);
    }

    // Forbidden statuses have DOM disabled=true and '차단됨' suffix
    const resolvedOpt = options.find((o) => o.value === 'resolved');
    expect(resolvedOpt).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(resolvedOpt!.disabled).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(resolvedOpt!.textContent).toContain('차단됨');
  });

  it('forbidden statuses have DOM disabled attribute', () => {
    render(
      <ReporterStatusChangeBlock
        voc={BASE_VOC}
        nextStatus="received"
        onChangeStatus={vi.fn()}
        draftDoc={null}
        owner={OWNER}
      />,
    );

    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option')) as HTMLOptionElement[];

    // All statuses not in allowed and not current are disabled
    const ALLOWED_SET = new Set(['received', 'reviewing', 'assigned']);
    for (const opt of options) {
      if (!ALLOWED_SET.has(opt.value)) {
        expect(opt.disabled).toBe(true);
      }
    }
  });

  it('shows red Callout when forbidden status is selected (via onChangeStatus)', () => {
    // The parent controls nextStatus; simulate selecting a forbidden value
    const { rerender } = render(
      <ReporterStatusChangeBlock
        voc={BASE_VOC}
        nextStatus="received"
        onChangeStatus={vi.fn()}
        draftDoc={null}
        owner={OWNER}
      />,
    );

    // Rerender with forbidden status
    rerender(
      <ReporterStatusChangeBlock
        voc={BASE_VOC}
        nextStatus="resolved"
        onChangeStatus={vi.fn()}
        draftDoc={null}
        owner={OWNER}
      />,
    );

    // Red callout should appear
    expect(screen.getByText('이 전환은 허용되지 않습니다')).toBeInTheDocument();
    const callout = screen.getByText('이 전환은 허용되지 않습니다').closest('[data-tone]');
    expect(callout?.getAttribute('data-tone')).toBe('red');
  });

  it('shows amber Callout when reporter_status_gate blocks next status', () => {
    const vocWithGate = {
      ...BASE_VOC,
      reporter_status_gate: {
        blocking_for: ['reviewing'] as never,
        reason: '연결된 Task가 doing 상태입니다.',
      },
    } as VocDetailEnvelope;

    render(
      <ReporterStatusChangeBlock
        voc={vocWithGate}
        nextStatus="reviewing"
        onChangeStatus={vi.fn()}
        draftDoc={null}
        owner={OWNER}
      />,
    );

    // Amber callout for gate
    expect(screen.getByText('연결된 Task 상태 확인 필요')).toBeInTheDocument();
    const callout = screen.getByText('연결된 Task 상태 확인 필요').closest('[data-tone]');
    expect(callout?.getAttribute('data-tone')).toBe('amber');
  });

  it('renders reporter preview card with body excerpt when draft has content', () => {
    const draftDoc = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '안녕하세요, 처리 중입니다.' }],
        },
      ],
    };

    render(
      <ReporterStatusChangeBlock
        voc={BASE_VOC}
        nextStatus="reviewing"
        onChangeStatus={vi.fn()}
        draftDoc={draftDoc}
        owner={OWNER}
      />,
    );

    // Preview card should be present with "Reporter가 보게 될 화면 미리보기" label
    expect(screen.getByText('Reporter가 보게 될 화면 미리보기')).toBeInTheDocument();
    // VOC display_id shown in preview
    expect(screen.getByText('VOC-0001')).toBeInTheDocument();
  });

  it('renders italic placeholder in preview card when draft is empty', () => {
    render(
      <ReporterStatusChangeBlock
        voc={BASE_VOC}
        nextStatus="reviewing"
        onChangeStatus={vi.fn()}
        draftDoc={null}
        owner={OWNER}
      />,
    );

    expect(
      screen.getByText('공개 메시지 본문을 입력하면 여기에서 미리 볼 수 있습니다.'),
    ).toBeInTheDocument();
  });

  it('shows 변경 예정 chip when next status differs from current and no gate blocks it', () => {
    render(
      <ReporterStatusChangeBlock
        voc={BASE_VOC}
        nextStatus="reviewing"
        onChangeStatus={vi.fn()}
        draftDoc={null}
        owner={OWNER}
      />,
    );

    // 변경 예정 chip appears when staged (nextStatus !== voc.reporter_facing_status) and no gate
    expect(screen.getByText('변경 예정')).toBeInTheDocument();
  });
});
