import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceSettingsScreen } from '../WorkspaceSettingsScreen.js';

const apiClientMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiClient: apiClientMock,
}));

describe('WorkspaceSettingsScreen read retry (#609)', () => {
  it('retries a failed read in place and renders the form after recovery', async () => {
    apiClientMock.mockRejectedValueOnce(new Error('temporary read failure')).mockResolvedValueOnce({
      status: 200,
      data: { permission_self_approval: 'allowed', survey_anonymity_threshold: 5 },
      etag: undefined,
      requestId: undefined,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceSettingsScreen />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('workspace-settings-error')).toHaveTextContent(
      '워크스페이스 설정을 불러오지 못했습니다.',
    );
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByTestId('workspace-settings-screen')).toBeInTheDocument();
    expect(screen.getByText('권한 요청 직접 승인', { exact: true })).toBeInTheDocument();
  });
});
