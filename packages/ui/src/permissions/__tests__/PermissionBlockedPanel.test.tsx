/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import {
  PermissionBlockedPanel,
  type PermissionState,
} from '../PermissionBlockedPanel.js';

describe('PermissionBlockedPanel — state rendering', () => {
  it('state=request_access: sets data-state attribute', () => {
    const { container } = render(
      <PermissionBlockedPanel state="request_access" category="VOC 상세" />,
    );
    expect(container.querySelector('[data-state="request_access"]')).not.toBeNull();
  });

  it('state=request_access: renders Lock icon area + heading + body copy', () => {
    render(<PermissionBlockedPanel state="request_access" category="VOC 상세" />);
    expect(screen.getByText('VOC 상세')).toBeInTheDocument();
    expect(
      screen.getByText('이 항목에 접근하려면 권한 요청이 필요합니다.'),
    ).toBeInTheDocument();
  });

  it('state=request_access: button disabled when onRequestAccess undefined', () => {
    render(<PermissionBlockedPanel state="request_access" category="VOC 상세" />);
    const btn = screen.getByRole('button', { name: '권한 요청하기' });
    expect(btn).toBeDisabled();
  });

  it('state=request_access: button enabled + onClick fires when handler provided', () => {
    const handler = vi.fn();
    render(
      <PermissionBlockedPanel
        state="request_access"
        category="VOC 상세"
        onRequestAccess={handler}
      />,
    );
    const btn = screen.getByRole('button', { name: '권한 요청하기' });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('state=request_access: renders requiredScope when provided', () => {
    render(
      <PermissionBlockedPanel
        state="request_access"
        category="VOC 상세"
        requiredScope={{ capability: 'voc.read', managed_system_id: 'ms-001' }}
      />,
    );
    expect(screen.getByText('voc.read · ms-001')).toBeInTheDocument();
  });

  it('state=request_access: renders requiredScope without managed_system_id', () => {
    render(
      <PermissionBlockedPanel
        state="request_access"
        category="VOC 상세"
        requiredScope={{ capability: 'voc.read' }}
      />,
    );
    expect(screen.getByText('voc.read')).toBeInTheDocument();
  });

  it('state=summary_visible: sets data-state attribute', () => {
    const { container } = render(
      <PermissionBlockedPanel state="summary_visible" category="요약" />,
    );
    expect(container.querySelector('[data-state="summary_visible"]')).not.toBeNull();
  });

  it('state=summary_visible: renders body copy', () => {
    render(<PermissionBlockedPanel state="summary_visible" category="요약" />);
    expect(screen.getByText('요약 정보만 표시됩니다.')).toBeInTheDocument();
  });

  it('state=summary_visible: renders summary slot when provided', () => {
    render(
      <PermissionBlockedPanel
        state="summary_visible"
        category="요약"
        summary={<span data-testid="summary-content">요약 내용</span>}
      />,
    );
    expect(screen.getByTestId('summary-content')).toBeInTheDocument();
  });

  it('state=summary_visible: fallback copy when summary undefined', () => {
    render(<PermissionBlockedPanel state="summary_visible" category="요약" />);
    expect(screen.getByText('요약 정보가 없습니다.')).toBeInTheDocument();
  });

  it('state=denied: sets data-state attribute', () => {
    const { container } = render(
      <PermissionBlockedPanel state="denied" category="VOC 상세" />,
    );
    expect(container.querySelector('[data-state="denied"]')).not.toBeNull();
  });

  it('state=denied: shows default message when no reason', () => {
    render(<PermissionBlockedPanel state="denied" category="VOC 상세" />);
    expect(screen.getByText('이 항목에 접근할 수 없습니다.')).toBeInTheDocument();
  });

  it('state=denied: shows reason when provided', () => {
    render(
      <PermissionBlockedPanel
        state="denied"
        category="VOC 상세"
        reason="계약 만료로 인해 접근이 차단되었습니다."
      />,
    );
    expect(
      screen.getByText('계약 만료로 인해 접근이 차단되었습니다.'),
    ).toBeInTheDocument();
  });

  it('state=denied: no CTA button rendered', () => {
    render(
      <PermissionBlockedPanel state="denied" category="VOC 상세" reason="denied" />,
    );
    expect(
      screen.queryByRole('button', { name: '권한 요청하기' }),
    ).toBeNull();
  });

  it('state=blocked_not_requestable: sets data-state attribute', () => {
    const { container } = render(
      <PermissionBlockedPanel
        state="blocked_not_requestable"
        category="VOC 상세"
      />,
    );
    expect(
      container.querySelector('[data-state="blocked_not_requestable"]'),
    ).not.toBeNull();
  });

  it('state=blocked_not_requestable: shows default message when no reason', () => {
    render(
      <PermissionBlockedPanel state="blocked_not_requestable" category="VOC 상세" />,
    );
    expect(screen.getByText('권한 요청이 허용되지 않습니다.')).toBeInTheDocument();
  });

  it('state=blocked_not_requestable: shows reason when provided', () => {
    render(
      <PermissionBlockedPanel
        state="blocked_not_requestable"
        category="VOC 상세"
        reason="조직 정책에 의해 차단됨"
      />,
    );
    expect(screen.getByText('조직 정책에 의해 차단됨')).toBeInTheDocument();
  });

  it('state=blocked_not_requestable: no CTA button rendered', () => {
    render(
      <PermissionBlockedPanel
        state="blocked_not_requestable"
        category="VOC 상세"
      />,
    );
    expect(
      screen.queryByRole('button', { name: '권한 요청하기' }),
    ).toBeNull();
  });
});

describe('PermissionBlockedPanel — audit footer', () => {
  it('renders decisionId when provided', () => {
    render(
      <PermissionBlockedPanel
        state="denied"
        category="VOC 상세"
        decisionId="dec-abc123"
      />,
    );
    expect(screen.getByText('dec-abc123')).toBeInTheDocument();
  });

  it('renders evaluatedRelative when both provided', () => {
    render(
      <PermissionBlockedPanel
        state="denied"
        category="VOC 상세"
        decisionId="dec-xyz"
        evaluatedRelative="5분 전"
      />,
    );
    expect(screen.getByText('dec-xyz')).toBeInTheDocument();
    expect(screen.getByText(/5분 전/)).toBeInTheDocument();
  });

  it('does NOT render footer when decisionId is absent', () => {
    render(<PermissionBlockedPanel state="denied" category="VOC 상세" />);
    // "Decision" text should be absent
    expect(screen.queryByText(/Decision/)).toBeNull();
  });
});

describe('PermissionBlockedPanel — all four states set data-state', () => {
  const states: PermissionState[] = [
    'request_access',
    'summary_visible',
    'denied',
    'blocked_not_requestable',
  ];
  states.forEach((state) => {
    it(`data-state="${state}" present`, () => {
      const { container } = render(
        <PermissionBlockedPanel state={state} category="테스트" />,
      );
      expect(container.querySelector(`[data-state="${state}"]`)).not.toBeNull();
    });
  });
});
