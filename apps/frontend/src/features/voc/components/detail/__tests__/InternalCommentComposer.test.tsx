// InternalCommentComposer.test.tsx — TDD RED
// Tests:
//   1. success POST shape: body_rich_content + mentions[] submitted on Add click
//   2. mentions[] deduplication: duplicate actor nodes appear only once in submitted mentions
//   3. Preview button is DOM-disabled (not hidden) per D-5.4
//
// C5.4 of slice3 #21.
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468 (internal variant)

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

// ── Module mocks ─────────────────────────────────────────────────────────────

const mockMutate = vi.fn();
vi.mock('@/features/voc/hooks/useVocInternalCommentMutation', () => ({
  useVocInternalCommentMutation: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
    error: null,
  })),
}));

// Mock RichEditor — exposes a callback to simulate doc changes with mention nodes.
let capturedOnChange: ((doc: import('@fops/ui').TipTapDoc) => void) | undefined;

vi.mock('@fops/ui', async (importActual) => {
  const actual = await importActual<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({
      onChange,
    }: {
      onChange?: (doc: import('@fops/ui').TipTapDoc) => void;
    }) => {
      capturedOnChange = onChange;
      return React.createElement('div', {
        'data-testid': 'rich-editor',
        role: 'textbox',
      });
    },
  };
});

import { InternalCommentComposer } from '../InternalCommentComposer';
import type { VocDetailEnvelope } from '@fops/shared';
import type { MeResponse } from '@/lib/auth/useMe';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-uuid-1111',
  display_id: 'VOC-0001',
  title: '테스트 VOC 제목',
  primary_managed_system_id: 'ms-uuid-1111',
  analytics_area_id: null,
  reporter_id: REPORTER_ID,
  owner_user_id: ADMIN_ID,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  similar_count: 0,
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: { allowed: ['reviewing'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
} as unknown as VocDetailEnvelope;

const ME_ADMIN: MeResponse = {
  actor: {
    id: ADMIN_ID,
    external_id: 'admin-1',
    email: 'admin@feedbackops.local',
    display_name: '관리자',
    role_level: 'admin',
  },
  workspace_id: 'ws-1111',
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('<InternalCommentComposer>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnChange = undefined;
  });

  it('submits body_rich_content and extracted mentions[] on Add click', () => {
    render(<InternalCommentComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: makeWrapper() });

    // Simulate typing content with a mention node.
    const docWithMention: import('@fops/ui').TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'mention', attrs: { actor_id: 'actor-uuid-1' } },
          ],
        },
      ],
    };
    act(() => {
      capturedOnChange?.(docWithMention);
    });

    const addBtn = screen.getByRole('button', { name: /add note/i });
    fireEvent.click(addBtn);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const callArg = (mockMutate.mock.calls[0] as unknown[])[0] as {
      body: { body_rich_content: unknown; mentions: string[] };
    };
    expect(callArg.body.body_rich_content).toBeDefined();
    expect(callArg.body.mentions).toContain('actor-uuid-1');
  });

  it('deduplicates duplicate mention nodes in the submitted mentions array', () => {
    render(<InternalCommentComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: makeWrapper() });

    // Simulate doc with two mentions of the same actor.
    const docWithDuplicateMentions: import('@fops/ui').TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { actor_id: 'actor-uuid-1' } },
            { type: 'text', text: ' and ' },
            { type: 'mention', attrs: { actor_id: 'actor-uuid-1' } }, // duplicate
            { type: 'mention', attrs: { actor_id: 'actor-uuid-2' } },
          ],
        },
      ],
    };
    act(() => {
      capturedOnChange?.(docWithDuplicateMentions);
    });

    const addBtn = screen.getByRole('button', { name: /add note/i });
    fireEvent.click(addBtn);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const callArg = (mockMutate.mock.calls[0] as unknown[])[0] as {
      body: { mentions: string[] };
    };
    const mentions: string[] = callArg.body.mentions;
    // Should be deduped: actor-uuid-1 only once
    expect(mentions.filter((m) => m === 'actor-uuid-1')).toHaveLength(1);
    expect(mentions).toContain('actor-uuid-2');
  });

  it('Preview button is DOM-disabled (not hidden) per D-5.4', () => {
    render(<InternalCommentComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: makeWrapper() });

    const previewBtn = screen.getByRole('button', { name: /preview/i });
    expect(previewBtn).toBeInTheDocument();
    expect(previewBtn).toBeDisabled();
  });
});
