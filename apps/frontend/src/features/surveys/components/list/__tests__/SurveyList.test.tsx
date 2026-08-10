import type { FrontendPermissionState } from '@/lib/api';
import { render, screen } from '@testing-library/react';
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

import { SurveyList } from '../SurveyList';

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
