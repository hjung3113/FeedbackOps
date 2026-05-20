import type { VocDetailEnvelope } from '@fops/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComposerReplyPreview } from '../ComposerReplyPreview';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_VOC = {
  id: 'voc-uuid-reply-1',
  display_id: 'VOC-0002',
  title: '답장 미리보기 테스트',
  reporter_facing_status: 'received',
  created_at: '2026-05-01T00:00:00Z',
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '원본 내용입니다.' }] }],
  },
} as unknown as VocDetailEnvelope;

const OWNER = { id: 'actor-002', display_name: '관리자' };
const REPORTER = { id: 'actor-001', display_name: '리포터' };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('<ComposerReplyPreview>', () => {
  it('renders VOC id, owner name, reporter name, and reply body when non-empty', () => {
    const draftDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '안녕하세요, 처리하겠습니다.' }] },
      ],
    } as import('@fops/ui').TipTapDoc;

    render(
      <ComposerReplyPreview voc={BASE_VOC} owner={OWNER} reporter={REPORTER} draftDoc={draftDoc} />,
    );

    // Owner name
    expect(screen.getByText(/관리자/)).toBeInTheDocument();
    // Reporter name
    expect(screen.getByText(/리포터/)).toBeInTheDocument();
    // Reply body text
    expect(screen.getByText(/안녕하세요/)).toBeInTheDocument();
  });

  it('renders italic placeholder copy when reply doc is empty', () => {
    const emptyDoc = { type: 'doc', content: [] } as import('@fops/ui').TipTapDoc;

    render(
      <ComposerReplyPreview voc={BASE_VOC} owner={OWNER} reporter={REPORTER} draftDoc={emptyDoc} />,
    );

    // Empty-body italic placeholder
    expect(screen.getByText('(메시지 본문이 비어있습니다)')).toBeInTheDocument();
  });
});
