import type { FindingDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { FindingOwnerField } from './FindingOwnerField';

const ACTOR = '40000000-0000-4000-8000-000000000004';
const ADMIN = '40000000-0000-4000-8000-000000000006';
const DEVELOPER = '40000000-0000-4000-8000-000000000007';
const finding: FindingDto = {
  id: '10000000-0000-4000-8000-000000000001',
  workspace_id: '90000000-0000-4000-8000-000000000009',
  display_id: 'FIN-179',
  primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
  title: 'Finding',
  summary: 'Synthesis',
  source_type: 'manual',
  source_id: null,
  owner_actor_id: ACTOR,
  owner_team_id: null,
  evidence_count: 0,
  severity: 'high',
  confidence: 'medium',
  status: 'draft',
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  created_by: ACTOR,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: null,
};
const originalFetch = globalThis.fetch;

function renderField(
  options: {
    eligibleOwners?: Array<{ id: string; name: string }>;
    actorsById?: Map<string, string>;
  } = {},
): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FindingOwnerField
        finding={finding}
        canManage
        actorsById={options.actorsById ?? new Map([[ACTOR, '분석가']])}
        eligibleOwners={options.eligibleOwners ?? [{ id: ACTOR, name: '분석가' }]}
      />
    </QueryClientProvider>,
  );
}

function openEditor(user: UserEvent): Promise<void> {
  return user.click(screen.getByRole('button', { name: '담당자 변경' }));
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

it.each([false, true])(
  'clears the real owner pair; failed=%s keeps the editor and performs no retry',
  async (failed) => {
    const bodies: unknown[] = [];
    globalThis.fetch = vi.fn(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify(
          failed
            ? { error: { code: 'validation.failed', message: '담당자를 확인해 주세요' } }
            : { ...finding, owner_actor_id: null },
        ),
        { status: failed ? 422 : 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FindingOwnerField
          finding={finding}
          canManage
          actorsById={new Map([[ACTOR, '분석가']])}
          eligibleOwners={[{ id: ACTOR, name: '분석가' }]}
        />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '담당자 변경' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '담당자' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: '담당자' }), { key: 'ArrowDown' });
    await user.click(await screen.findByRole('option', { name: '미배정' }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(bodies).toEqual([{ owner_actor_id: null, owner_team_id: null }]));
    if (failed) {
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: '담당자' })).toHaveTextContent('미배정');
      await user.click(screen.getByRole('button', { name: '취소' }));
      expect(screen.getByText('분석가')).toBeInTheDocument();
    } else {
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument(),
      );
      expect(client.getQueryData(['finding', finding.id])).toMatchObject({
        owner_actor_id: null,
        status: 'draft',
      });
    }
    expect(bodies).toHaveLength(1);
  },
);

it('readers see the persisted owner without a mutation control', () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <FindingOwnerField
        finding={finding}
        canManage={false}
        actorsById={new Map([[ACTOR, '분석가']])}
        eligibleOwners={[]}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText('분석가')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '담당자 변경' })).not.toBeInTheDocument();
});

it('offers only the eligible owners it is handed, not other known actors', async () => {
  renderField({
    actorsById: new Map([
      [ACTOR, '분석가'],
      [ADMIN, 'Mock Admin'],
      [DEVELOPER, 'Mock Developer Two'],
    ]),
    eligibleOwners: [
      { id: ADMIN, name: 'Mock Admin' },
      { id: DEVELOPER, name: 'Mock Developer Two' },
    ],
  });
  const user = userEvent.setup();
  await openEditor(user);
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '담당자' }));
  fireEvent.keyDown(screen.getByRole('combobox', { name: '담당자' }), { key: 'ArrowDown' });

  expect(await screen.findByRole('option', { name: 'Mock Admin' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Mock Developer Two' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '미배정' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '분석가' })).not.toBeInTheDocument();
});

it('moves focus into the Select on open and back to the trigger after 저장', async () => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ ...finding, owner_actor_id: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  renderField();
  const user = userEvent.setup();
  await openEditor(user);

  expect(screen.getByRole('combobox', { name: '담당자' })).toHaveFocus();

  fireEvent.mouseDown(screen.getByRole('combobox', { name: '담당자' }));
  fireEvent.keyDown(screen.getByRole('combobox', { name: '담당자' }), { key: 'ArrowDown' });
  await user.click(await screen.findByRole('option', { name: '미배정' }));
  await user.click(screen.getByRole('button', { name: '저장' }));

  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: '담당자 변경' })).toHaveFocus();
});

it('Escape cancels the editor with the listbox closed and restores the trigger focus', async () => {
  renderField();
  const user = userEvent.setup();
  await openEditor(user);
  const combobox = screen.getByRole('combobox', { name: '담당자' });
  expect(combobox).toHaveFocus();

  fireEvent.keyDown(combobox, { key: 'Escape' });

  expect(screen.queryByRole('combobox', { name: '담당자' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '담당자 변경' })).toHaveFocus();
});

it('Escape with the listbox open only closes the listbox', async () => {
  renderField();
  const user = userEvent.setup();
  await openEditor(user);
  const combobox = screen.getByRole('combobox', { name: '담당자' });
  fireEvent.mouseDown(combobox);
  fireEvent.keyDown(combobox, { key: 'ArrowDown' });
  expect(await screen.findByRole('option', { name: '미배정' })).toBeInTheDocument();

  fireEvent.keyDown(combobox, { key: 'Escape' });

  expect(screen.getByRole('combobox', { name: '담당자' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '미배정' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
});

it('maps an ineligible_actor 422 to the specific owner copy', async () => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          code: 'validation.failed',
          message: 'invalid owner',
          detail: { fields: [{ path: ['owner_actor_id'], code: 'ineligible_actor' }] },
        }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      ),
  );
  renderField();
  const user = userEvent.setup();
  await openEditor(user);
  await user.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '이 사용자는 이 Managed System의 Finding을 담당할 수 없습니다.',
  );
  expect(screen.getByRole('combobox', { name: '담당자' })).toBeInTheDocument();
});
