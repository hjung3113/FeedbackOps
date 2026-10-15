import { type VocListItem, vocOwnerCandidatesSchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VocTriageScreen } from '../VocTriageScreen';

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(() => 'owner-success'),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const ownerId = '00000000-0000-4000-8000-000000000001';
const msId = '00000000-0000-4000-8000-000000000002';
const a: VocListItem = {
  id: '00000000-0000-4000-8000-000000000003',
  display_id: 'VOC-A',
  title: '첫 번째 VOC',
  reporter_facing_status: 'received',
  severity: null,
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  primary_managed_system_id: msId,
  reporter_id: ownerId,
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};
const b: VocListItem = {
  ...a,
  id: '00000000-0000-4000-8000-000000000004',
  display_id: 'VOC-B',
  title: '두 번째 VOC',
  severity: 'medium',
};
const candidates = vocOwnerCandidatesSchema.parse({
  actors: [{ id: ownerId, display_name: '배정 후보', eligible: true }],
});
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function Harness({ items }: { items: VocListItem[] }) {
  const [selectedId, select] = useState<string | null>(a.id);
  return (
    <VocTriageScreen
      items={items}
      selectedId={selectedId}
      onSelectVoc={select}
      onAdvanceVoc={select}
      activeTab="untriaged"
      onTabChange={vi.fn()}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('owner validation race after optimistic confirm (#1172)', () => {
  it.each([1, 2])(
    'restores the original VOC and its message with %i queued VOCs',
    async (count) => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const patches: { path: string; body: unknown }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = String(input);
          if (init?.method === 'PATCH') {
            patches.push({ path, body: JSON.parse(String(init.body)) });
            await gate;
            return json(
              {
                code: 'validation.failed',
                message: 'invalid owner',
                detail: {
                  fields: [{ path: ['owner_user_id'], code: 'ineligible_actor' }],
                },
              },
              422,
            );
          }
          if (path.endsWith('/owner-candidates')) return json(candidates);
          if (path.startsWith('/analytics-areas')) return json({ items: [], total: 0 });
          if (path.endsWith('/recommendations')) return json({ items: [], total: 0 });
          return json({
            ...a,
            description_rich_content: { type: 'doc', content: [] },
            next_actions: [],
            permission_decisions: {},
          });
        }),
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <Harness items={count === 1 ? [a] : [a, b]} />
        </QueryClientProvider>,
      );
      fireEvent.click(await screen.findByRole('button', { name: /배정 후보/ }));
      fireEvent.click(screen.getByRole('button', { name: /Triage 확정/ }));
      await waitFor(() =>
        expect(patches).toEqual([
          {
            path: `/vocs/${a.id}`,
            body: {
              severity: null,
              owner_user_id: ownerId,
              owner_team_id: null,
              analytics_area_id: null,
              triage_state: 'triaged',
            },
          },
        ]),
      );
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /VOC-A/ })).not.toBeInTheDocument(),
      );
      if (count === 2) {
        expect(screen.getAllByText(b.title).length).toBeGreaterThan(0);
        // Staged ownership from A must not appear on B while A's request is pending.
        expect(screen.getByRole('button', { name: '(미지정)' })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        expect(toast.error).not.toHaveBeenCalled();
      } else {
        expect(screen.queryByRole('button', { name: /Triage 확정/ })).not.toBeInTheDocument();
      }
      await act(async () => {
        release();
        await gate;
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /VOC-A/ })).toHaveAttribute(
          'aria-selected',
          'true',
        ),
      );
      expect(screen.getAllByText(a.title).length).toBeGreaterThan(0);
      expect(toast.error).toHaveBeenCalledWith(
        '담당자를 배정할 수 없습니다. 배정에 필요한 권한이 없습니다.',
      );
      expect(screen.getByRole('button', { name: '(미지정)' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      if (count === 2) {
        fireEvent.click(screen.getByRole('button', { name: /VOC-B/ }));
        expect(screen.getByRole('button', { name: /VOC-B/ })).toHaveAttribute(
          'aria-selected',
          'true',
        );
        expect(screen.getByRole('button', { name: '(미지정)' })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        expect(
          screen.queryByText('담당자를 배정할 수 없습니다. 배정에 필요한 권한이 없습니다.'),
        ).not.toBeInTheDocument();
      }
      client.clear();
    },
  );
});
