import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import {
  type CoverageThresholds,
  dashboardSummarySchema,
  resolveCoverageThresholds,
} from '@fops/shared';

import { ApiError } from '@/lib/api';

import {
  IntegrationCoverageRouteShell,
  integrationCoverageSearchSchema,
} from '../../../../routes/_authed/integration/coverage';
import { WorkspaceSettingsForm } from '../WorkspaceSettingsScreen.js';
import type { WorkspaceSettings } from '../use-workspace-settings.js';

const apiClientMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiClient: apiClientMock,
}));

const savedCoverage: CoverageThresholds = resolveCoverageThresholds();

function settingsWith(overrides: Partial<WorkspaceSettings> = {}): WorkspaceSettings {
  return {
    coverage_thresholds: savedCoverage,
    permission_self_approval: 'allowed',
    survey_anonymity_threshold: 5,
    ...overrides,
  };
}

function patchResponse(next: WorkspaceSettings) {
  return { status: 200, data: next, etag: undefined, requestId: undefined };
}

function renderForm(initial: WorkspaceSettings) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceSettingsForm initialSettings={initial} />
    </QueryClientProvider>,
  );
  return queryClient;
}

function startCoverageEdit(buttonIndex: number): void {
  const editButtons = screen.getAllByRole('button', { name: '편집' });
  const editButton = editButtons[buttonIndex];
  if (!editButton) throw new Error(`Edit button ${buttonIndex} missing`);
  fireEvent.click(editButton);
}

// Row order in the form: self-approval, anonymity, then the five band rows in
// shared COVERAGE_METRIC_IDS order — voc-task is the first band row.
const VOC_TASK_EDIT_BUTTON_INDEX = 2;

// System scope for the behavioural consumer test (valid UUID per the route's
// search schema).
const CONSUMER_SYSTEM_ID = '77777777-0000-0000-0000-0000000000a1';

function summaryResponse(status: 'bad' | 'good', percent: number): Response {
  const summary = dashboardSummarySchema.parse({
    computed_at: '2026-10-13T00:00:00.000Z',
    kpis: {},
    action_queues: [],
    coverage: [{ id: 'voc-task', value: percent, total: 100, percent, status }],
    by_managed_system: [],
  });
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('WorkspaceSettingsForm Coverage bands (#1088)', () => {
  test('renders the five labeled pairs with their saved cutoffs', () => {
    apiClientMock.mockReset();
    renderForm(settingsWith());

    expect(screen.getByText('커버리지 기준', { exact: true })).toBeInTheDocument();
    for (const metric of Object.keys(savedCoverage) as Array<keyof CoverageThresholds>) {
      expect(screen.getByTestId(`coverage-band-value-${metric}`)).toHaveTextContent(
        '양호 ≥ 75% · 주의 ≥ 40%',
      );
    }
  });

  test('saves only the changed metric pair and shows the saved result', async () => {
    const next = settingsWith({
      coverage_thresholds: {
        ...savedCoverage,
        'voc-task': { good_min_percent: 80, warn_min_percent: 50 },
      },
    });
    apiClientMock.mockReset().mockResolvedValue(patchResponse(next));
    renderForm(settingsWith());

    startCoverageEdit(VOC_TASK_EDIT_BUTTON_INDEX);
    fireEvent.change(screen.getByLabelText('VOC → Task 연결 양호 기준'), {
      target: { value: '80' },
    });
    fireEvent.change(screen.getByLabelText('VOC → Task 연결 주의 기준'), {
      target: { value: '50' },
    });
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));

    await waitFor(() => {
      expect(apiClientMock).toHaveBeenCalledWith('PATCH', '/workspace/settings', {
        body: {
          coverage_thresholds: {
            'voc-task': { good_min_percent: 80, warn_min_percent: 50 },
          },
        },
      });
    });
    expect(await screen.findByTestId('coverage-band-value-voc-task')).toHaveTextContent(
      '양호 ≥ 80% · 주의 ≥ 50%',
    );
    // The other four pairs were not resent.
    expect(apiClientMock).toHaveBeenCalledTimes(1);
  });

  test('blocks saving a reversed pair, names the ordering rule, and flags the warn input', () => {
    apiClientMock.mockReset();
    renderForm(settingsWith());

    startCoverageEdit(VOC_TASK_EDIT_BUTTON_INDEX);
    fireEvent.change(screen.getByLabelText('VOC → Task 연결 양호 기준'), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByLabelText('VOC → Task 연결 주의 기준'), {
      target: { value: '80' },
    });

    // The message names the broken rule, not the generic integer rule.
    expect(screen.getByText('주의 기준은 양호 기준보다 작아야 합니다.')).toBeInTheDocument();
    const good = screen.getByLabelText('VOC → Task 연결 양호 기준');
    const warn = screen.getByLabelText('VOC → Task 연결 주의 기준');
    // The offending input is the warn band; both inputs point at the hint.
    expect(warn).toHaveAttribute('aria-invalid', 'true');
    expect(good).not.toHaveAttribute('aria-invalid');
    expect(good).toHaveAttribute('aria-describedby', 'coverage-band-hint-voc-task');
    expect(warn).toHaveAttribute('aria-describedby', 'coverage-band-hint-voc-task');
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled();
    expect(apiClientMock).not.toHaveBeenCalled();
  });

  test('blocks a non-integer band with the integer rule and flags the good input', () => {
    apiClientMock.mockReset();
    renderForm(settingsWith());

    startCoverageEdit(VOC_TASK_EDIT_BUTTON_INDEX);
    fireEvent.change(screen.getByLabelText('VOC → Task 연결 양호 기준'), {
      target: { value: '80.5' },
    });

    expect(screen.getByText('0에서 100 사이의 정수를 입력하세요.')).toBeInTheDocument();
    const good = screen.getByLabelText('VOC → Task 연결 양호 기준');
    expect(good).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('VOC → Task 연결 주의 기준')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled();
  });

  // #1087 UX: clearing a field keeps the raw empty string while editing and
  // blocks saving; Number('') = 0 must never reach the draft or the PATCH.
  test('keeps a cleared band field raw and invalid instead of writing 0', () => {
    apiClientMock.mockReset();
    renderForm(settingsWith());

    startCoverageEdit(VOC_TASK_EDIT_BUTTON_INDEX);
    const good = screen.getByLabelText('VOC → Task 연결 양호 기준');
    fireEvent.change(good, { target: { value: '' } });

    expect(good).toHaveValue(null);
    expect(good).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('0에서 100 사이의 정수를 입력하세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled();
    expect(apiClientMock).not.toHaveBeenCalled();

    // Closing the editor keeps the saved pair — the cleared field never
    // became a 0 write-back.
    fireEvent.click(screen.getByRole('button', { name: '완료' }));
    expect(screen.getByTestId('coverage-band-value-voc-task')).toHaveTextContent(
      '양호 ≥ 75% · 주의 ≥ 40%',
    );
  });

  // #1087 UX: the save bar counts dirty Coverage metrics individually.
  test('counts two dirty coverage metrics individually in the save bar', () => {
    apiClientMock.mockReset();
    renderForm(settingsWith());

    startCoverageEdit(VOC_TASK_EDIT_BUTTON_INDEX);
    fireEvent.change(screen.getByLabelText('VOC → Task 연결 양호 기준'), {
      target: { value: '80' },
    });
    fireEvent.click(screen.getByRole('button', { name: '완료' }));

    // finding-execution is the second band row (edit buttons: self-approval,
    // anonymity, then the five band rows in COVERAGE_METRIC_IDS order).
    startCoverageEdit(VOC_TASK_EDIT_BUTTON_INDEX + 1);
    fireEvent.change(screen.getByLabelText('실행 중인 Finding 양호 기준'), {
      target: { value: '80' },
    });

    const saveBar = screen.getByTestId('workspace-settings-save-bar');
    expect(saveBar).toHaveTextContent('커버리지 기준 (2)');
    expect(saveBar).toHaveTextContent('저장되지 않은 변경 1건');
  });

  // #1087 UX: 커버리지 기준 편집 lands on /admin/settings#coverage and the
  // settings screen scrolls the coverage section into view.
  test('scrolls the coverage section into view for the #coverage anchor', () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const originalHash = window.location.hash;
    window.location.hash = 'coverage';
    try {
      apiClientMock.mockReset();
      renderForm(settingsWith());

      expect(document.getElementById('coverage')).not.toBeNull();
      expect(scrollSpy).toHaveBeenCalled();
    } finally {
      window.location.hash = originalHash;
      scrollSpy.mockRestore();
    }
  });

  test('discard restores the saved band values', async () => {
    apiClientMock.mockReset();
    renderForm(settingsWith());

    startCoverageEdit(VOC_TASK_EDIT_BUTTON_INDEX);
    fireEvent.change(screen.getByLabelText('VOC → Task 연결 양호 기준'), {
      target: { value: '80' },
    });
    fireEvent.click(screen.getByRole('button', { name: '버리기' }));

    expect(await screen.findByTestId('coverage-band-value-voc-task')).toHaveTextContent(
      '양호 ≥ 75% · 주의 ≥ 40%',
    );
    expect(screen.queryByTestId('workspace-settings-save-bar')).toBeNull();
    expect(apiClientMock).not.toHaveBeenCalled();
  });

  test('a server block keeps the draft for retry and succeeds afterwards', async () => {
    const next = settingsWith({
      coverage_thresholds: {
        ...savedCoverage,
        'voc-task': { good_min_percent: 90, warn_min_percent: 30 },
      },
    });
    apiClientMock
      .mockReset()
      .mockRejectedValueOnce(
        new ApiError(403, { code: 'permission.denied', message: 'workspace.admin required' }),
      )
      .mockResolvedValueOnce(patchResponse(next));
    renderForm(settingsWith());

    startCoverageEdit(VOC_TASK_EDIT_BUTTON_INDEX);
    fireEvent.change(screen.getByLabelText('VOC → Task 연결 양호 기준'), {
      target: { value: '90' },
    });
    fireEvent.change(screen.getByLabelText('VOC → Task 연결 주의 기준'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '워크스페이스 설정 저장에 실패했습니다.',
    );
    // The draft survives the failed save for retry.
    expect(screen.getByLabelText('VOC → Task 연결 양호 기준')).toHaveValue(90);

    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    expect(await screen.findByTestId('coverage-band-value-voc-task')).toHaveTextContent(
      '양호 ≥ 90% · 주의 ≥ 30%',
    );
  });

  // Replaces the former cache-internals test (asserted isInvalidated): the
  // 56-C acceptance is observed through a real summary consumer — the rendered
  // Coverage route sharing this QueryClient — across the workspace (all) and
  // system scopes, ending in the surface's own failed-refresh error state.
  test.each([
    { label: 'all scope', initialPath: '/integration/coverage' },
    {
      label: 'system scope',
      initialPath: `/integration/coverage?managedSystem=${CONSUMER_SYSTEM_ID}`,
    },
  ])(
    'a saved band change refetches the rendered Coverage consumer ($label)',
    async ({ initialPath }) => {
      const next = settingsWith({
        coverage_thresholds: {
          ...savedCoverage,
          'voc-task': { good_min_percent: 80, warn_min_percent: 50 },
        },
      });
      apiClientMock.mockReset().mockResolvedValue(patchResponse(next));

      // The consumer's own endpoints go through global fetch (not the mocked
      // apiClient barrel): me, the workspace.admin check for the band-editor
      // link, and the sequenced summary — old bands, changed bands, then a
      // failed refresh.
      const summaryResponses = [
        summaryResponse('bad', 18),
        summaryResponse('good', 85),
        new Response('refresh failed', { status: 500 }),
      ];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/me/permissions/check')) {
          return new Response(JSON.stringify({ state: 'approved', decision: { allow: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === '/me') {
          return new Response(
            JSON.stringify({
              actor: {
                id: '99999999-9999-4999-8999-999999999999',
                external_id: 'actor',
                email: 'actor@example.test',
                display_name: '운영자',
                role_level: 'admin',
              },
              workspace_id: '11111111-1111-4111-8111-111111111111',
            }),
            { status: 200 },
          );
        }
        if (url.startsWith('/dashboard/summary')) {
          return summaryResponses.shift() ?? new Response('refresh failed', { status: 500 });
        }
        if (url.startsWith('/managed-systems') || url.startsWith('/analytics-areas')) {
          return new Response(JSON.stringify({ items: [], total: 0 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('not mocked', { status: 500 });
      }) as typeof globalThis.fetch;

      try {
        const rootRoute = createRootRoute({
          component: () => (
            <>
              <WorkspaceSettingsForm initialSettings={settingsWith()} />
              <Outlet />
            </>
          ),
        });
        const route = createRoute({
          getParentRoute: () => rootRoute,
          path: '/integration/coverage',
          validateSearch: (raw) => integrationCoverageSearchSchema.parse(raw),
          component: IntegrationCoverageRouteShell,
        });
        const router = createRouter({
          routeTree: rootRoute.addChildren([route]),
          history: createMemoryHistory({ initialEntries: [initialPath] }),
        });
        render(
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <RouterProvider router={router} />
          </QueryClientProvider>,
        );

        // Initial load: the server's old bands put voc-task at 18% → bad.
        await waitFor(() => {
          expect(screen.getByTestId('coverage-row-voc-task')).toBeVisible();
        });
        expect(screen.getByTestId('coverage-percent-voc-task').className).toContain(
          'text-accent-danger',
        );

        startCoverageEdit(VOC_TASK_EDIT_BUTTON_INDEX);
        fireEvent.change(screen.getByLabelText('VOC → Task 연결 양호 기준'), {
          target: { value: '80' },
        });
        fireEvent.change(screen.getByLabelText('VOC → Task 연결 주의 기준'), {
          target: { value: '50' },
        });
        fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));

        // The save invalidates the dashboard-summary family; the consumer
        // refetches and renders the changed server status (85% → good).
        await waitFor(() => {
          expect(screen.getByTestId('coverage-percent-voc-task').className).toContain(
            'text-accent-success',
          );
        });
        expect(screen.getByTestId('coverage-percent-voc-task').className).not.toContain(
          'text-accent-danger',
        );

        // A failed refresh keeps the cached rows and shows the surface's error.
        fireEvent.click(screen.getByTestId('coverage-refresh'));
        expect(await screen.findByText('커버리지 요약을 불러올 수 없습니다.')).toBeVisible();
        expect(screen.getByTestId('coverage-row-voc-task')).toBeVisible();
        expect(screen.getByTestId('coverage-percent-voc-task').className).toContain(
          'text-accent-success',
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});
