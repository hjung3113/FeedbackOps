import { ApiError } from '@/lib/api/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const requestProps = vi.hoisted(
  () => [] as Array<{ capability: string; returnRouteIntent: string }>,
);
const useVocListMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/admin/permissions/request-access-button', () => ({
  RequestAccessButton: (props: { capability: string; returnRouteIntent: string }) => {
    requestProps.push(props);
    return <div data-testid={`request-access-${props.capability}`}>{props.returnRouteIntent}</div>;
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('@/features/voc/hooks/useVocList', () => ({ useVocList: useVocListMock }));
vi.mock('@/features/voc/components/detail/VocDetailPanel', () => ({
  VocDetailPanel: () => null,
}));
vi.mock('@/features/voc/components/list/VocList', () => ({ VocList: () => null }));

import { SurveyResultsSummary } from '@/features/surveys/components/results/SurveyResultsSummary';
import { useInboxRoute } from '@/features/voc/routes/InboxRoute';
import { PermissionStateView } from '../permission-state-view.js';

const SURVEY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function withClient(node: ReactNode) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );
}

function InboxHarness() {
  return useInboxRoute('inbox').list;
}

describe('permission request return routes', () => {
  beforeEach(() => {
    cleanup();
    requestProps.length = 0;
    window.history.pushState({}, '', '/permission-state?selected=state-fixture');
    useVocListMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(403, {
        code: 'permission.scope_required',
        message: 'VOC fixture scope is required',
        requestable_permission: {
          permission: 'voc.read.fixture',
          managed_system_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      }),
      refetch: vi.fn(),
    });
  });

  test('AC-D8e three call sites pass distinct return_route_intent values', () => {
    render(
      withClient(
        <PermissionStateView state="request_access" capability="permission.state.fixture" />,
      ),
    );
    expect(screen.getByTestId('request-access-permission.state.fixture')).toBeInTheDocument();
    cleanup();

    render(
      withClient(
        <SurveyResultsSummary
          survey={
            {
              id: SURVEY_ID,
              display_id: 'SRV-D8E',
              title: 'Distinct survey fixture',
              type: 'outcome',
              status: 'closed',
              questions: [],
            } as never
          }
          results={
            {
              survey_id: SURVEY_ID,
              status: 'closed',
              identity_protected: true,
              questions: [],
              next_actions: [
                {
                  id: 'create_finding',
                  availability: 'blocked_requestable',
                  intent: 'open_finding_draft',
                  requestable_permission: {
                    permission: 'finding.manage.fixture',
                    managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                  },
                },
              ],
            } as never
          }
        />,
      ),
    );
    expect(screen.getByTestId('request-access-finding.manage.fixture')).toBeInTheDocument();
    cleanup();

    render(withClient(<InboxHarness />));
    expect(screen.getByTestId('request-access-voc.read.fixture')).toBeInTheDocument();

    const values = requestProps.map(({ returnRouteIntent }) => returnRouteIntent);
    expect(values).toHaveLength(3);
    expect(new Set(values)).toEqual(
      new Set([
        '/permission-state?selected=state-fixture',
        `/surveys/${SURVEY_ID}/results`,
        '/vocs?view=inbox',
      ]),
    );
  });
});
