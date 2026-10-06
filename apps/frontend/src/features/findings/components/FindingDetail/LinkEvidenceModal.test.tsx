import { type VocListItem, linkEvidenceRequestSchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LinkEvidenceModal } from './LinkEvidenceModal';

const FINDING_ID = '10000000-0000-0000-0000-000000000001';
const MANAGED_SYSTEM_ID = '30000000-0000-0000-0000-000000000003';
const VOC_ID = '10000000-0000-0000-0000-000000000012';

const VOC: VocListItem = {
  id: VOC_ID,
  display_id: 'VOC-12',
  title: '로그인 오류',
  primary_managed_system_id: MANAGED_SYSTEM_ID,
  analytics_area_id: null,
  reporter_id: '40000000-0000-0000-0000-000000000004',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'medium',
  reporter_facing_status: 'reviewing',
  triage_state: 'triaged',
  source_context: 'direct_use',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  similar_count: 0,
  attachment_count: 0,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LinkEvidenceModal', () => {
  it('uses a searchable VOC picker and submits the selected VOC id', async () => {
    const user = userEvent.setup();
    let submittedBody: string | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/vocs?')) {
        return jsonResponse({ items: [VOC], page: { has_more: false } });
      }
      if (url === `/findings/${FINDING_ID}/link-evidence`) {
        submittedBody = String(init?.body);
        return jsonResponse({});
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <LinkEvidenceModal
          findingId={FINDING_ID}
          managedSystemId={MANAGED_SYSTEM_ID}
          open
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const picker = await screen.findByRole('combobox', { name: 'VOC 선택' });
    expect(screen.queryByText(/UUID/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/xxxxxxxx/)).not.toBeInTheDocument();
    await user.click(picker);
    await user.click(await screen.findByRole('option', { name: 'VOC-12 · 로그인 오류' }));
    await user.click(screen.getByTestId('link-evidence-submit'));

    await waitFor(() => expect(submittedBody).not.toBeNull());
    const parsedBody = linkEvidenceRequestSchema.parse(JSON.parse(submittedBody ?? 'null'));
    expect(parsedBody).toEqual({ source_type: 'voc', source_id: VOC_ID });
    expect(fetchMock).toHaveBeenCalledWith(
      `/vocs?view=inbox&managed_system_id=${MANAGED_SYSTEM_ID}&limit=100`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('keeps the current VOC-only helper copy without exposing the source type value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ items: [VOC], page: { has_more: false } })),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <LinkEvidenceModal
          findingId={FINDING_ID}
          managedSystemId={MANAGED_SYSTEM_ID}
          open
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/현재 VOC 소스만 연결할 수 있습니다\./)).toBeInTheDocument();
    expect(screen.queryByText(/source_type: voc/)).not.toBeInTheDocument();
  });
});
