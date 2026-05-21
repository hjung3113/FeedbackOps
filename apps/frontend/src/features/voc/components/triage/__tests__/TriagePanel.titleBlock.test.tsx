// TriagePanel.titleBlock.test.tsx — title block restore (option A)
//
// Reference: .review/title-reference.png. The triage panel reuses the same
// PanelTitleBlock as the read-only detail panel and must adopt the xl title
// + status-pill+meta line + BODY card treatment for consistency.

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { TriagePanel } from '../TriagePanel';
import type { VocListItem } from '@fops/shared';

const TRIAGE_VOC: VocListItem = {
  id: 'voc-title-block-test',
  display_id: 'VOC-TB1',
  title: 'Looker 모델 변경 후 알림이 오지 않음',
  reporter_facing_status: 'received',
  severity: null,
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  primary_managed_system_id: '00000000-0000-0000-0000-000000000099',
  reporter_id: '00000000-0000-0000-0000-000000000010',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TriagePanel — title block restore (.review/title-reference.png)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the title at xl typography', () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ actors: [] })) as typeof globalThis.fetch;
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <TriagePanel voc={TRIAGE_VOC} />
      </Wrapper>,
    );
    const h2 = screen.getByRole('heading', { level: 2, name: TRIAGE_VOC.title });
    expect(h2).toHaveClass('text-xl');
    expect(h2).toHaveClass('font-bold');
  });

  it('renders the BODY section label in English (per relaxed copy rule)', () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ actors: [] })) as typeof globalThis.fetch;
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <TriagePanel voc={TRIAGE_VOC} />
      </Wrapper>,
    );
    expect(screen.getByText('BODY')).toBeInTheDocument();
  });

  it('wraps the triage body in a tinted card (bg-surface-card-elevated)', () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ actors: [] })) as typeof globalThis.fetch;
    const Wrapper = makeWrapper();
    const { container } = render(
      <Wrapper>
        <TriagePanel voc={TRIAGE_VOC} />
      </Wrapper>,
    );
    const card = container.querySelector('[data-testid="triage-body-card"]');
    expect(card).not.toBeNull();
    expect(card?.className).toMatch(/bg-surface-card-elevated/);
    expect(card?.className).toMatch(/rounded-md/);
  });
});
