import type { VocDetailEnvelope } from '@fops/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComposerPublicPreview } from '../ComposerPublicPreview';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_VOC = {
  id: 'voc-uuid-preview-1',
  display_id: 'VOC-0001',
  title: '미리보기 테스트 제목',
  reporter_facing_status: 'received',
} as unknown as VocDetailEnvelope;

const OWNER = { id: 'actor-001', display_name: '김관리자' };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('<ComposerPublicPreview>', () => {
  it('renders VOC id, next status badge, owner name, and body excerpt when body is non-empty', () => {
    const draftDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '검토 완료되었습니다.' }] }],
    } as import('@fops/ui').TipTapDoc;

    render(
      <ComposerPublicPreview
        voc={BASE_VOC}
        owner={OWNER}
        nextStatus="reviewing"
        draftDoc={draftDoc}
      />,
    );

    // VOC id
    expect(screen.getByText(BASE_VOC.display_id)).toBeInTheDocument();
    // Owner attribution
    expect(screen.getByText(/김관리자/)).toBeInTheDocument();
    // Body text rendered via RichContentRenderer
    expect(screen.getByText(/검토 완료/)).toBeInTheDocument();
    // status hint — status is changing
    expect(screen.getByText(/Reporter-facing 상태가/)).toBeInTheDocument();
  });

  it('renders italic placeholder copy when body doc is empty', () => {
    const emptyDoc = { type: 'doc', content: [] } as import('@fops/ui').TipTapDoc;

    render(
      <ComposerPublicPreview
        voc={BASE_VOC}
        owner={OWNER}
        nextStatus="received"
        draftDoc={emptyDoc}
      />,
    );

    // Empty-body italic placeholder
    expect(screen.getByText('(본문이 비어있습니다)')).toBeInTheDocument();
    // Status unchanged hint
    expect(screen.getByText('상태는 그대로 유지됩니다.')).toBeInTheDocument();
  });
});
