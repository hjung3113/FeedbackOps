import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Survey } from '../../types';
import { SurveyBuilder } from './SurveyBuilder';

const apiClient = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiClient,
}));

const survey: Survey = {
  id: 'survey-1',
  display_id: 'SRV-1',
  title: 'Q3 사용성 진단',
  type: 'discovery',
  status: 'draft',
  description: '기존 설명',
  primary_managed_system_id: '11111111-1111-4111-8111-111111111111',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: '22222222-2222-4222-8222-222222222222',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [],
};

function renderBuilder(current: Survey = survey) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SurveyBuilder survey={current} canManage onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('Survey builder description', () => {
  beforeEach(() => {
    apiClient.mockClear();
    apiClient.mockResolvedValue({ data: { id: 'survey-1' } });
  });

  it('saves a description-only edit as the exact partial patch', async () => {
    renderBuilder({ ...survey, description: null });

    fireEvent.change(screen.getByRole('textbox', { name: '설명 (선택)' }), {
      target: { value: '배포 맥락' },
    });

    expect(screen.getByText('저장되지 않은 변경 사항')).toBeInTheDocument();
    expect(apiClient).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith('PATCH', '/surveys/survey-1', {
        body: { description: '배포 맥락' },
      }),
    );
    expect(apiClient).toHaveBeenCalledTimes(1);
  });

  it('clears a saved description with an empty string that survives reload', async () => {
    let storedSurvey = structuredClone(survey);
    apiClient.mockImplementation(async (method, _path, options) => {
      if (method === 'PATCH') {
        storedSurvey = { ...storedSurvey, ...options.body };
      }
      return { data: structuredClone(storedSurvey) };
    });
    const view = renderBuilder();
    fireEvent.change(screen.getByRole('textbox', { name: '설명 (선택)' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith('PATCH', '/surveys/survey-1', {
        body: { description: '' },
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText('저장되지 않은 변경 사항')).not.toBeInTheDocument(),
    );
    view.unmount();
    const readback = await apiClient('GET', '/surveys/survey-1');
    renderBuilder(readback.data);
    expect(screen.getByRole('textbox', { name: '설명 (선택)' })).toHaveValue('');
  });

  it('shows a published description read-only and skips an empty one', () => {
    const published = renderBuilder({ ...survey, status: 'open', description: '배포 맥락' });
    expect(screen.getByText('배포 맥락')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '설명 (선택)' })).not.toBeInTheDocument();
    expect(screen.getByText('진행 중 상태 — 질문 변경은 잠겨 있습니다.')).toBeInTheDocument();
    published.unmount();

    renderBuilder({ ...survey, status: 'open', description: null });
    expect(screen.queryByRole('textbox', { name: '설명 (선택)' })).not.toBeInTheDocument();
    expect(screen.queryByText('배포 맥락')).not.toBeInTheDocument();
    expect(screen.getByText('진행 중 상태 — 질문 변경은 잠겨 있습니다.')).toBeInTheDocument();
  });

  it('shows the edited description in the respondent preview', async () => {
    renderBuilder({ ...survey, description: null });
    fireEvent.change(screen.getByRole('textbox', { name: '설명 (선택)' }), {
      target: { value: '미리보기 설명' },
    });
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));

    const dialog = await screen.findByRole('dialog', { name: '응답자 미리보기' });
    expect(dialog).toHaveTextContent('미리보기 설명');
  });
});
