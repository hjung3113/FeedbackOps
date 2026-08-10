import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { WorkspaceSettingsForm } from '../WorkspaceSettingsScreen.js';

describe('WorkspaceSettingsForm', () => {
  test('AC-D1 renders the Permission Request-only label and the Task Request policy boundary', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceSettingsForm
          initialSettings={{ permission_self_approval: 'allowed', survey_anonymity_threshold: 5 }}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByText('Self-approval of Permission Request', { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Task Request 자가승인은 ADR-0026 규칙을 따르며 이 설정과 무관합니다.', {
        exact: true,
      }),
    ).toBeInTheDocument();
  });
});
