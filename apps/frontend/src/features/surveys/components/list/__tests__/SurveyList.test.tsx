import type { FrontendPermissionState } from '@/lib/api';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/admin/permissions/request-access-button', () => ({
  RequestAccessButton: ({
    capability,
    returnRouteIntent,
  }: {
    capability: string;
    returnRouteIntent: string;
  }) => (
    <button
      type="button"
      data-return-route-intent={returnRouteIntent}
      data-testid={`request-access-${capability}`}
    >
      Request access
    </button>
  ),
}));

import type { Survey } from '../../../types';
import { SurveyList } from '../SurveyList';

const survey: Survey = {
  id: 'survey-1',
  display_id: 'SRV-21',
  title: 'Q3 사용성 진단',
  type: 'discovery',
  status: 'draft',
  description: '설문 설명',
  primary_managed_system_id: 'managed-system-1',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: 'actor-1',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [],
};

function renderEmptyList(props: {
  canCreate: boolean;
  permissionState?: FrontendPermissionState;
}) {
  render(
    <SurveyList
      surveys={[]}
      isLoading={false}
      error={null}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      canCreate={props.canCreate}
      {...(props.permissionState !== undefined ? { permissionState: props.permissionState } : {})}
    />,
  );
}

describe('SurveyList empty state', () => {
  it('renders the existing creation recovery when survey creation is allowed', () => {
    renderEmptyList({ canCreate: true });

    expect(screen.getByText('생성된 설문이 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('설문을 만들어 응답을 수집하세요.')).toBeInTheDocument();
    expect(screen.getByTestId('survey-empty-create-button')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '필터 초기화' })).not.toBeInTheDocument();
  });

  it('resets the status tab and search after a filtered miss', async () => {
    render(
      <SurveyList
        surveys={[survey]}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: /Open/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Survey 검색' }), '찾을 수 없음');

    expect(await screen.findByText('현재 조건에 맞는 설문이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('상태: Open · 검색어: 찾을 수 없음')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '필터 초기화' }));

    expect(await screen.findByText('Q3 사용성 진단')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Survey 검색' })).toHaveValue('');
  });

  it('renders request access for a requestable missing survey.manage permission', () => {
    renderEmptyList({ canCreate: false, permissionState: 'request_access' });

    expect(screen.getByText('생성된 설문이 없습니다.')).toBeInTheDocument();
    expect(
      screen.getByText('설문을 만들려면 survey.manage 권한이 필요합니다.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('request-access-survey.manage')).toBeInTheDocument();
    expect(screen.queryByTestId('survey-empty-create-button')).not.toBeInTheDocument();
  });

  it('renders contact-admin recovery for a non-requestable missing survey.manage permission', () => {
    renderEmptyList({ canCreate: false, permissionState: 'blocked_non_requestable' });

    expect(screen.getByText('생성된 설문이 없습니다.')).toBeInTheDocument();
    expect(
      screen.getByText('설문을 만들려면 survey.manage 권한이 필요합니다.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('survey-empty-contact-admin')).toHaveTextContent(
      '담당 관리자에게 문의하세요.',
    );
    expect(screen.queryByTestId('request-access-survey.manage')).not.toBeInTheDocument();
  });

  it('fails closed with contact-admin recovery when survey permission state is unavailable', () => {
    // Omit the optional prop to preserve the unavailable-state fail-closed path.
    renderEmptyList({ canCreate: false });

    expect(screen.getByText('생성된 설문이 없습니다.')).toBeInTheDocument();
    expect(
      screen.getByText('설문을 만들려면 survey.manage 권한이 필요합니다.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('survey-empty-contact-admin')).toHaveTextContent(
      '담당 관리자에게 문의하세요.',
    );
    expect(screen.queryByTestId('request-access-survey.manage')).not.toBeInTheDocument();
  });
});
