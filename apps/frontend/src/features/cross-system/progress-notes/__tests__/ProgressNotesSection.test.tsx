// ProgressNotesSection.test.tsx — #377 section contracts:
//   1. per-surface copy (Finding Korean / Task English) on the empty state
//   2. composer renders only when canCompose is true (manage gate hint)
//   3. status_change rows render kind badge + consumer-supplied from → to badges
//   4. a 403 read maps to a permission-blocked panel, not a blank failure

import { ApiError } from '@/lib/api/types';
import type { FindingStatus } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/api/findings-comments', () => ({
  listFindingComments: vi.fn(),
  createFindingComment: vi.fn(),
}));
vi.mock('@/lib/api/tasks-comments', () => ({
  listTaskComments: vi.fn(),
  createTaskComment: vi.fn(),
}));
// The composer is editor-heavy and covered through the real composer's own
// dependencies; the section's contract here is only WHEN it renders.
vi.mock('../ProgressNotesComposer', () => ({
  ProgressNotesComposer: () => <div data-testid="progress-notes-composer" />,
}));

import { listFindingComments } from '@/lib/api/findings-comments';
import { listTaskComments } from '@/lib/api/tasks-comments';
import { ProgressNotesSection } from '../ProgressNotesSection';

// Untyped items: assignable to either surface's list response.
function emptyPage() {
  return { items: [], page: { has_more: false } };
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.mocked(listFindingComments).mockReset();
  vi.mocked(listTaskComments).mockReset();
});

describe('<ProgressNotesSection>', () => {
  it('renders the Korean empty state and hides the composer without manage permission (finding)', async () => {
    vi.mocked(listFindingComments).mockResolvedValue(emptyPage());
    render(<ProgressNotesSection resource={{ kind: 'finding', id: 'f1' }} canCompose={false} />, {
      wrapper: makeWrapper(),
    });

    expect(await screen.findByText('아직 진행 메모가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByTestId('progress-notes-composer')).not.toBeInTheDocument();
  });

  it('shows the composer when canCompose is true (task, English copy)', async () => {
    vi.mocked(listTaskComments).mockResolvedValue(emptyPage());
    render(<ProgressNotesSection resource={{ kind: 'task', id: 't1' }} canCompose={true} />, {
      wrapper: makeWrapper(),
    });

    expect(await screen.findByText('No progress notes yet.')).toBeInTheDocument();
    expect(screen.getByTestId('progress-notes-composer')).toBeInTheDocument();
  });

  it('renders a status_change row with the kind badge and consumer status badges', async () => {
    vi.mocked(listFindingComments).mockResolvedValue({
      items: [
        {
          id: 'c1',
          finding_id: 'f1',
          actor_id: 'a1',
          kind: 'status_change',
          from_status: 'draft',
          to_status: 'active',
          body_rich_content: null,
          created_at: '2026-09-01T10:00:00Z',
        },
      ],
      page: { has_more: false },
    });
    render(
      <ProgressNotesSection
        resource={{ kind: 'finding', id: 'f1' }}
        canCompose={false}
        renderStatusBadge={(status: FindingStatus) => <span data-testid={`badge-${status}`} />}
      />,
      { wrapper: makeWrapper() },
    );

    expect(await screen.findByText('상태 변경')).toBeInTheDocument();
    expect(screen.getByTestId('badge-draft')).toBeInTheDocument();
    expect(screen.getByTestId('badge-active')).toBeInTheDocument();
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('maps a 403 read to a permission-blocked panel (Task reads require manage on the backend)', async () => {
    vi.mocked(listTaskComments).mockRejectedValue(
      new ApiError(403, {
        code: 'permission.denied',
        message: 'finding.manage capability required',
      }),
    );
    render(<ProgressNotesSection resource={{ kind: 'task', id: 't1' }} canCompose={false} />, {
      wrapper: makeWrapper(),
    });

    expect(await screen.findByText('Progress notes')).toBeInTheDocument();
    expect(screen.queryByTestId('progress-notes-composer')).not.toBeInTheDocument();
  });
});
