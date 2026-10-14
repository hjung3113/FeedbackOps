import type { ManagedSystemDefaultDiagnostics } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ManagedSystemsAdminPage } from '../managed-systems.js';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_NAME = 'Owner Fixture Name';
const ACTOR_EMAIL = 'email-must-never-render@example.test';
const TEAM_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_OWNER_SYSTEM_ID = '33333333-3333-4333-8333-333333333333';
const TEAM_OWNER_SYSTEM_ID = '44444444-4444-4444-8444-444444444444';

type CapturedRequest = { method: string; pathname: string; body: Record<string, unknown> };

const systems = [
  {
    id: UNKNOWN_OWNER_SYSTEM_ID,
    workspace_id: '55555555-5555-4555-8555-555555555555',
    slug: 'owner-unknown',
    name: 'Owner Unknown System',
    external_key: null,
    default_owner_actor_id: null,
    default_owner_team_id: null,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
  {
    id: TEAM_OWNER_SYSTEM_ID,
    workspace_id: '55555555-5555-4555-8555-555555555555',
    slug: 'team-owned',
    name: 'Team Owned System',
    external_key: null,
    default_owner_actor_id: null,
    default_owner_team_id: TEAM_ID,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(
  options: {
    diagnosticsError?: boolean;
    diagnostics?: ManagedSystemDefaultDiagnostics['items'];
    mutationError?: boolean;
    reviewerTeam?: boolean;
    fieldError?: 'owner' | 'reviewer';
    revokedActor?: boolean;
    candidateError?: boolean;
    ownerOnly?: boolean;
    sameName?: boolean;
  } = {},
) {
  let saved = false;
  const captured: CapturedRequest[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (method === 'POST' || method === 'PATCH') {
      captured.push({
        method,
        pathname: url.pathname,
        body: init?.body ? JSON.parse(String(init.body)) : {},
      });
      if (options.fieldError)
        return response(
          {
            code: 'validation.failed',
            message: 'invalid',
            detail: {
              fields: [
                { path: [`default_${options.fieldError}_actor_id`], code: 'ineligible_actor' },
              ],
            },
          },
          422,
        );
      if (options.mutationError)
        return response(
          { code: 'validation.failed', message: '검토자 배정에 필요한 권한이 없습니다.' },
          422,
        );
      saved = true;
      return response({});
    }
    if (url.pathname === '/me/permissions/check') {
      return response({ state: 'approved', decision: { allow: true } });
    }
    if (url.pathname === '/managed-systems/default-diagnostics') {
      if (options.diagnosticsError)
        return response({ code: 'permission.denied', message: 'denied' }, 403);
      return response({
        items: saved
          ? []
          : (options.diagnostics ?? [
              {
                managed_system_id: TEAM_OWNER_SYSTEM_ID,
                workflow: 'task_request',
                responsibility: 'reviewer',
                rule: 'managed_system_reviewer',
                category: 'ineligible_actor',
                origin: 'creation_failure',
                count: 2,
                last_failed_at: '2026-10-13T00:00:00.000Z',
              },
            ]),
      });
    }
    if (url.pathname === '/managed-systems')
      return response({
        items: systems.map((system) => ({
          ...system,
          ...(options.sameName ? { name: 'Team Owned System' } : {}),
          default_reviewer_actor_id: options.revokedActor ? ACTOR_ID : null,
          default_reviewer_team_id: options.reviewerTeam ? TEAM_ID : null,
        })),
        total: 2,
      });
    if (url.pathname === '/analytics-areas') return response({ items: [], total: 0 });
    if (url.pathname === '/permissions/requests') return response({ requests: [], count: 0 });
    if (url.pathname === '/managed-systems/default-candidates') {
      if (options.candidateError)
        return response({ code: 'permission.denied', message: 'denied' }, 403);
      return response({
        owners: [{ id: ACTOR_ID, display_name: ACTOR_NAME, eligible: true }],
        reviewers: options.ownerOnly
          ? []
          : [{ id: ACTOR_ID, display_name: ACTOR_NAME, eligible: !options.revokedActor }],
      });
    }
    if (url.pathname === '/actors') {
      return response({
        actors: [
          {
            id: ACTOR_ID,
            display_name: ACTOR_NAME,
            email: ACTOR_EMAIL,
            role_level: 'developer',
          },
        ],
      });
    }
    if (url.pathname === '/actors/resolve') {
      return response({ actors: [], teams: [{ id: TEAM_ID, name: 'Platform Team Fixture' }] });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}`);
  });
  return captured;
}

function renderPage() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/admin/managed-systems',
    component: ManagedSystemsAdminPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/admin/managed-systems'] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function openRegister() {
  fireEvent.click(await screen.findByTestId('ms-register-button'));
  expect(screen.getByTestId('ms-register-dialog')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('create-slug'), { target: { value: 'owner-fixture' } });
  fireEvent.change(screen.getByTestId('create-name'), {
    target: { value: 'Owner Fixture System' },
  });
}

async function chooseActor(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(await screen.findByRole('option', { name: ACTOR_NAME }));
}

describe('Managed System default owner', () => {
  afterEach(() => vi.restoreAllMocks());

  test('AC-D9a registration sends exactly one body with the selected actor owner', async () => {
    const captured = installFetch();
    renderPage();
    await openRegister();
    await chooseActor('create-default-owner');

    fireEvent.submit(screen.getByTestId('create-managed-system-form'));

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]).toEqual({
      method: 'POST',
      pathname: '/managed-systems',
      body: {
        slug: 'owner-fixture',
        name: 'Owner Fixture System',
        default_owner_actor_id: ACTOR_ID,
      },
    });
  });

  test('AC-D9b unassigned registration renders owner and omits both keys', async () => {
    const captured = installFetch();
    renderPage();
    await openRegister();
    expect(screen.getByTestId('create-default-owner')).toHaveTextContent('(미지정)');

    fireEvent.submit(screen.getByTestId('create-managed-system-form'));
    await waitFor(() => expect(captured).toHaveLength(1));

    expect(captured[0]?.body.slug).toBe('owner-fixture');
    expect(captured[0]?.body).not.toHaveProperty('default_owner_actor_id');
    expect(captured[0]?.body).not.toHaveProperty('default_owner_team_id');
  });

  test('AC-D9c owner-unknown edit sends one PATCH with the selected actor', async () => {
    const captured = installFetch();
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-configure-owner-unknown'));
    expect(screen.getByTestId('ms-edit-dialog')).toBeInTheDocument();
    await chooseActor('edit-default-owner-owner-unknown');

    fireEvent.submit(screen.getByTestId('edit-managed-system-form-owner-unknown'));

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]).toEqual({
      method: 'PATCH',
      pathname: `/managed-systems/${UNKNOWN_OWNER_SYSTEM_ID}`,
      body: { default_owner_actor_id: ACTOR_ID, default_owner_team_id: null },
    });
  });

  test('AC-D9d choosing an actor replaces the team in the single owner selection', async () => {
    const captured = installFetch();
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-configure-team-owned'));
    const selector = screen.getByTestId('edit-default-owner-team-owned');
    await waitFor(() => expect(selector).toHaveTextContent('Platform Team Fixture'));
    await chooseActor('edit-default-owner-team-owned');
    expect(selector).toHaveTextContent(ACTOR_NAME);

    fireEvent.submit(screen.getByTestId('edit-managed-system-form-team-owned'));

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]?.body).toEqual({
      default_owner_actor_id: ACTOR_ID,
      default_owner_team_id: null,
    });
    expect(
      captured.some(
        ({ body }) =>
          typeof body.default_owner_actor_id === 'string' &&
          typeof body.default_owner_team_id === 'string',
      ),
    ).toBe(false);
  });

  test('AC-D9e owner options render actor name and never the distinct email', async () => {
    installFetch();
    renderPage();
    await openRegister();
    fireEvent.click(screen.getByTestId('create-default-owner'));

    const listbox = await screen.findByRole('listbox');
    // The actor list arrives from an async query; the listbox mounts first with
    // only the static "(미지정)" entry. Sync getByRole here raced that fetch.
    expect(await within(listbox).findByRole('option', { name: ACTOR_NAME })).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.body).not.toHaveTextContent(ACTOR_EMAIL);
  });

  test('56-D reviewer registration is independent of owner and preserves email privacy', async () => {
    const captured = installFetch();
    renderPage();
    await openRegister();
    expect(screen.getByLabelText('기본 검토자 (선택)')).toHaveTextContent('(미지정)');
    await chooseActor('create-default-reviewer');
    expect(document.body).not.toHaveTextContent(ACTOR_EMAIL);
    fireEvent.submit(screen.getByTestId('create-managed-system-form'));
    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]?.body).toEqual({
      slug: 'owner-fixture',
      name: 'Owner Fixture System',
      default_reviewer_actor_id: ACTOR_ID,
    });
  });

  test('56-D omitted reviewer registration sends neither reviewer key', async () => {
    const captured = installFetch();
    renderPage();
    await openRegister();
    fireEvent.submit(screen.getByTestId('create-managed-system-form'));
    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]?.body).not.toHaveProperty('default_reviewer_actor_id');
    expect(captured[0]?.body).not.toHaveProperty('default_reviewer_team_id');
  });

  test('56-D reviewer PATCH clears the other target while preserving owner', async () => {
    const captured = installFetch();
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-configure-team-owned'));
    await chooseActor('edit-default-reviewer-team-owned');
    fireEvent.submit(screen.getByTestId('edit-managed-system-form-team-owned'));
    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]?.body).toEqual({
      default_reviewer_actor_id: ACTOR_ID,
      default_reviewer_team_id: null,
    });
  });

  test('56-D known reviewer team can be cleared without changing owner', async () => {
    const captured = installFetch({ reviewerTeam: true });
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-configure-team-owned'));
    const selector = screen.getByTestId('edit-default-reviewer-team-owned');
    await waitFor(() => expect(selector).toHaveTextContent('Platform Team Fixture'));
    fireEvent.click(selector);
    fireEvent.click(await screen.findByRole('option', { name: '(미지정)' }));
    fireEvent.submit(screen.getByTestId('edit-managed-system-form-team-owned'));
    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]?.body).toEqual({
      default_reviewer_actor_id: null,
      default_reviewer_team_id: null,
    });
  });

  test('56-D warnings refetch after reviewer edit instead of retaining stale failure', async () => {
    installFetch();
    renderPage();
    expect(await screen.findByText('배정에 필요한 권한이 없습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ms-configure-team-owned'));
    await chooseActor('edit-default-reviewer-team-owned');
    fireEvent.submit(screen.getByTestId('edit-managed-system-form-team-owned'));
    await waitFor(() =>
      expect(screen.queryByText('배정에 필요한 권한이 없습니다.')).not.toBeInTheDocument(),
    );
  });

  test('56-D diagnostics denial is visible and retryable, never shown as healthy', async () => {
    installFetch({ diagnosticsError: true });
    renderPage();
    expect(await screen.findByText('설정 경고를 확인하지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  test('56-D reviewer rejection preserves selection and shows server error', async () => {
    installFetch({ mutationError: true });
    renderPage();
    await openRegister();
    await chooseActor('create-default-reviewer');
    fireEvent.submit(screen.getByTestId('create-managed-system-form'));
    expect(await screen.findByTestId('create-error')).toHaveTextContent(
      '입력값이 올바르지 않습니다.',
    );
    expect(screen.getByTestId('create-default-reviewer')).toHaveTextContent(ACTOR_NAME);
  });
  test.each([
    { kind: 'owner', edit: false },
    { kind: 'reviewer', edit: false },
    { kind: 'owner', edit: true },
    { kind: 'reviewer', edit: true },
  ] as const)(
    'FIX1 $kind server field error is associated with the picker (edit=$edit)',
    async ({ kind, edit }) => {
      installFetch({ fieldError: kind });
      renderPage();
      if (edit) fireEvent.click(await screen.findByTestId('ms-configure-team-owned'));
      else await openRegister();
      const testId = edit ? `edit-default-${kind}-team-owned` : `create-default-${kind}`;
      await chooseActor(testId);
      fireEvent.submit(
        screen.getByTestId(
          edit ? 'edit-managed-system-form-team-owned' : 'create-managed-system-form',
        ),
      );
      const picker = screen.getByTestId(testId);
      await waitFor(() => expect(picker).toHaveAttribute('aria-invalid', 'true'));
      expect(picker).toHaveAccessibleDescription('배정에 필요한 권한이 없습니다.');
      expect(picker).toHaveTextContent(ACTOR_NAME);
    },
  );

  test('FIX1 revoked current reviewer remains visible and marked, but cannot be chosen', async () => {
    installFetch({ revokedActor: true });
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-configure-team-owned'));
    const picker = screen.getByTestId('edit-default-reviewer-team-owned');
    await waitFor(() =>
      expect(picker).toHaveTextContent(`${ACTOR_NAME} · 배정에 필요한 권한이 없습니다.`),
    );
    fireEvent.click(picker);
    expect(
      await screen.findByRole('option', { name: `${ACTOR_NAME} · 배정에 필요한 권한이 없습니다.` }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  test('diagnostics distinguish current configuration and skipped rules without claiming unassignment', async () => {
    const common = {
      managed_system_id: TEAM_OWNER_SYSTEM_ID,
      workflow: 'task_request' as const,
      responsibility: 'reviewer' as const,
      category: 'ineligible_actor' as const,
    };
    installFetch({
      diagnostics: [
        {
          ...common,
          rule: 'managed_system_reviewer',
          origin: 'configuration',
          count: 1,
          last_failed_at: null,
        },
        {
          ...common,
          rule: 'managed_system_reviewer',
          origin: 'creation_failure',
          count: 2,
          last_failed_at: '2026-10-13T00:00:00.000Z',
        },
        {
          ...common,
          rule: 'managed_system_owner',
          origin: 'creation_failure',
          count: 2,
          last_failed_at: '2026-10-13T00:00:00.000Z',
        },
      ],
    });
    renderPage();
    const current = await screen.findByText('현재 설정');
    const row = current.closest('li');
    if (!row) throw new Error('Configuration row missing');
    expect(row).toHaveTextContent(
      'Team Owned System · 기본 검토자 · 배정에 필요한 권한이 없습니다. · 현재 설정',
    );
    expect(row).not.toHaveTextContent('Task Request');
    const failures = screen.getAllByText(
      '생성 시 기본 배정 실패 2건 · 마지막 2026. 10. 13. 오전 9:00',
    );
    expect(failures).toHaveLength(2);
    const lines = [row.textContent, ...failures.map((item) => item.closest('li')?.textContent)];
    expect(new Set(lines).size).toBe(3);
    expect(failures[0]?.closest('li')).toHaveTextContent(
      'Task Request · Managed System 기본 검토자',
    );
    expect(failures[1]?.closest('li')).toHaveTextContent(
      'Task Request · Managed System 기본 담당자',
    );
    expect(screen.queryByText(/생성 시 미배정/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Team Owned System 설정 열기' })).toHaveLength(3);
  });

  test('diagnostics tell same-name systems apart by slug', async () => {
    const warning = {
      workflow: 'voc' as const,
      responsibility: 'owner' as const,
      rule: 'managed_system_owner' as const,
      category: 'missing' as const,
      origin: 'configuration' as const,
      count: 1,
      last_failed_at: null,
    };
    installFetch({
      sameName: true,
      diagnostics: [
        { ...warning, managed_system_id: UNKNOWN_OWNER_SYSTEM_ID },
        { ...warning, managed_system_id: TEAM_OWNER_SYSTEM_ID },
      ],
    });
    renderPage();
    expect(
      await screen.findByRole('button', { name: 'Team Owned System (owner-unknown) 설정 열기' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Team Owned System (team-owned) 설정 열기' }),
    ).toBeInTheDocument();
  });

  test('FIX1 warning explains repair, marks its row and opens that system settings', async () => {
    installFetch();
    renderPage();
    expect(
      await screen.findByText(
        '현재 설정 문제와 생성 시 기본 배정 실패 기록을 확인하고 필요하면 설정에서 기본 담당자/검토자를 다시 지정하세요.',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('managed-system-row-team-owned')).getByText('자동 배정 경고'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('managed-system-row-owner-unknown')).queryByText('자동 배정 경고'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Team Owned System 설정 열기' }));
    expect(screen.getByRole('heading', { name: 'Team Owned System 설정' })).toBeInTheDocument();
    expect(
      screen.getByText('Task Request 검토에 자동 배정됩니다. 비우면 기본 담당자가 검토합니다.'),
    ).toBeInTheDocument();
  });

  test('FIX1 owner-only server candidate is absent from reviewer options', async () => {
    installFetch({ ownerOnly: true });
    renderPage();
    await openRegister();
    await chooseActor('create-default-owner');
    fireEvent.click(screen.getByTestId('create-default-reviewer'));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(1);
    expect(within(listbox).queryByRole('option', { name: ACTOR_NAME })).not.toBeInTheDocument();
  });

  test('FIX1 candidate read failure is visible and retry loads eligible options', async () => {
    installFetch({ candidateError: true });
    renderPage();
    await openRegister();
    expect(await screen.findAllByText('배정 후보를 불러오지 못했습니다.')).toHaveLength(2);
    installFetch();
    const retry = screen.getAllByRole('button', { name: '다시 시도' })[0];
    if (!retry) throw new Error('Retry missing');
    fireEvent.click(retry);
    await chooseActor('create-default-owner');
  });
  test('FIX1 diagnostics retry restores warnings after a failed read', async () => {
    installFetch({ diagnosticsError: true });
    renderPage();
    expect(await screen.findByText('설정 경고를 확인하지 못했습니다.')).toBeInTheDocument();
    installFetch();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(
      await screen.findByText(
        '현재 설정 문제와 생성 시 기본 배정 실패 기록을 확인하고 필요하면 설정에서 기본 담당자/검토자를 다시 지정하세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('설정 경고를 확인하지 못했습니다.')).not.toBeInTheDocument();
  });
});
