import type { VocListItem } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const evidenceMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
}));

vi.mock('../../hooks/useEvidenceMutations', () => ({
  useAddEvidenceHighlightMutation: () => evidenceMutation,
}));

import { AddEvidenceModal } from './AddEvidenceModal';

const VOC_ID = '10000000-0000-0000-0000-000000000012';
const VOC: VocListItem = {
  id: VOC_ID,
  display_id: 'VOC-12',
  title: '로그인 오류',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
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

function installVocList(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [VOC], page: { has_more: false } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

describe('AddEvidenceModal source kind options', () => {
  beforeEach(() => {
    evidenceMutation.mutate.mockClear();
    evidenceMutation.reset.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ items: [], page: { has_more: false } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('labels every evidence source kind from the shared copy map', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddEvidenceModal
          findingId="10000000-0000-0000-0000-000000000001"
          managedSystemId="30000000-0000-0000-0000-000000000003"
          open
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('evidence-source-type-select'));

    expect(await screen.findByRole('option', { name: '수동 메모' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'VOC' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Survey' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Note (manual)' })).not.toBeInTheDocument();
  });

  it.each([
    ['VOC', 'VOC를 선택하세요.'],
    ['Survey', 'VOC 또는 Survey 출처를 선택하면 ID가 필요합니다.'],
  ])(
    'shows Korean validation when %s has no source ID and prevents submission',
    async (sourceLabel, expectedMessage) => {
      const user = userEvent.setup();
      render(
        <QueryClientProvider client={new QueryClient()}>
          <AddEvidenceModal
            findingId="10000000-0000-0000-0000-000000000001"
            managedSystemId="30000000-0000-0000-0000-000000000003"
            open
            onClose={vi.fn()}
          />
        </QueryClientProvider>,
      );

      fireEvent.click(screen.getByTestId('evidence-source-type-select'));
      fireEvent.click(await screen.findByRole('option', { name: sourceLabel }));
      await user.type(screen.getByTestId('evidence-quote-input'), '로그인 실패 요약');

      await user.click(screen.getByTestId('add-evidence-submit'));

      expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
      expect(screen.getByRole('alert')).not.toHaveTextContent(
        'source_id is required unless source_type is note',
      );

      expect(evidenceMutation.mutate).not.toHaveBeenCalled();
    },
  );

  it('uses the VOC picker for VOC and keeps the UUID input for Survey responses', async () => {
    const user = userEvent.setup();
    installVocList();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddEvidenceModal
          findingId="10000000-0000-0000-0000-000000000001"
          managedSystemId="30000000-0000-0000-0000-000000000003"
          open
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('evidence-source-type-select'));
    fireEvent.click(await screen.findByRole('option', { name: 'VOC' }));

    const picker = await screen.findByRole('combobox', { name: 'VOC 선택' });
    expect(picker).toBeInTheDocument();
    expect(screen.queryByText('소스 ID (UUID)')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('evidence-source-id-input')).not.toBeInTheDocument();

    fireEvent.click(picker);
    await user.click(await screen.findByRole('option', { name: 'VOC-12 · 로그인 오류' }));

    fireEvent.click(screen.getByTestId('evidence-source-type-select'));
    fireEvent.click(await screen.findByRole('option', { name: 'Survey' }));

    expect(screen.getByText('소스 ID (UUID)')).toBeInTheDocument();
    expect(screen.getByTestId('evidence-source-id-input')).toHaveAttribute(
      'placeholder',
      'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    );
    expect(screen.getByTestId('evidence-source-id-input')).toHaveValue('');
  });

  it('submits the selected VOC id as source_id', async () => {
    const user = userEvent.setup();
    installVocList();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddEvidenceModal
          findingId="10000000-0000-0000-0000-000000000001"
          managedSystemId="30000000-0000-0000-0000-000000000003"
          open
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('evidence-source-type-select'));
    fireEvent.click(await screen.findByRole('option', { name: 'VOC' }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    await user.click(await screen.findByRole('option', { name: 'VOC-12 · 로그인 오류' }));
    await user.type(screen.getByTestId('evidence-quote-input'), '로그인 실패 요약');
    await user.click(screen.getByTestId('add-evidence-submit'));

    expect(evidenceMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        source_type: 'voc',
        source_id: VOC_ID,
        quote_or_summary: '로그인 실패 요약',
      }),
      expect.any(Object),
    );
  });
});
