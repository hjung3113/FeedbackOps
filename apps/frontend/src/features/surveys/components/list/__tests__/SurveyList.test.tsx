import type { FrontendPermissionState } from '@/lib/api';
import { SURVEY_TYPE_LABELS } from '@/lib/copy/enum-labels';
import { surveyTypeSchema } from '@fops/shared';
import { fireEvent, render, screen } from '@testing-library/react';
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
      권한 요청
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

    await userEvent.click(screen.getByRole('tab', { name: /진행 중/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Survey 검색' }), '찾을 수 없음');

    expect(await screen.findByText('현재 조건에 맞는 설문이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('상태: 진행 중 · 검색어: 찾을 수 없음')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '필터 초기화' }));

    expect(await screen.findByText('Q3 사용성 진단')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /전체/ })).toHaveAttribute('aria-selected', 'true');
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

describe('SurveyList tabs', () => {
  it('uses shared tabs with status counts and preserves filtering and row selection', () => {
    const onSelect = vi.fn();
    const openSurvey = {
      ...survey,
      id: 'survey-open',
      display_id: 'SRV-22',
      status: 'open' as const,
    };
    render(
      <SurveyList
        surveys={[survey, openSurvey]}
        isLoading={false}
        error={null}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('tablist', { name: 'Survey status' })).toBeInTheDocument();
    const allTab = screen.getByRole('tab', { name: '전체 2' });
    const panel = screen.getByRole('tabpanel');
    expect(allTab).toHaveAttribute('aria-selected', 'true');
    expect(allTab).toHaveAttribute('aria-controls', panel.id);
    expect(document.getElementById(allTab.getAttribute('aria-controls') ?? '')).toBe(panel);
    expect(panel).toHaveAttribute('aria-labelledby', allTab.id);
    expect(screen.getByRole('tab', { name: /진행 중 1/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /초안 1/ })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /진행 중 1/ }));

    const openTab = screen.getByRole('tab', { name: /진행 중 1/ });
    expect(openTab).toHaveAttribute('aria-selected', 'true');
    expect(openTab).toHaveAttribute('aria-controls', panel.id);
    expect(document.getElementById(openTab.getAttribute('aria-controls') ?? '')).toBe(panel);
    expect(panel).toHaveAttribute('aria-labelledby', openTab.id);
    expect(screen.queryByTestId('survey-row-survey-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('survey-row-survey-open'));
    expect(onSelect).toHaveBeenCalledWith('survey-open');
  });
});

describe('SurveyList type labels', () => {
  it.each(surveyTypeSchema.options)('renders a display label for survey type %s', (type) => {
    render(
      <SurveyList
        surveys={[{ ...survey, type }]}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        canCreate
      />,
    );

    expect(screen.getByText(SURVEY_TYPE_LABELS[type])).toBeInTheDocument();
    expect(screen.queryByText(type, { exact: true })).not.toBeInTheDocument();
  });
});
