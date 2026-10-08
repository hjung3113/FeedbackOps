// VocTriageScreen.fullscreen.test.tsx — #852 expanded reading column
//
// The column wrapper stays mounted across the fullscreen toggle, so the
// panel and its toggle node are not remounted. Class tokens are pinned on
// DetailPanelReadingColumn.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(() => 'toast-fullscreen-test'),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import type { VocListItem } from '@fops/shared';
import { type TriageTab, VocTriageScreen } from '../VocTriageScreen';

const MOCK_VOC: VocListItem = {
  id: 'voc-fullscreen-001',
  display_id: 'VOC-F-001',
  title: '전체 화면 테스트 VOC',
  reporter_facing_status: 'received',
  severity: null,
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  primary_managed_system_id: '00000000-0000-0000-0000-000000000001',
  reporter_id: '00000000-0000-0000-0000-000000000010',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
  attachment_count: 0,
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function ControlledTriageScreen() {
  const [activeTab, setActiveTab] = useState<TriageTab>('unassigned');
  return (
    <VocTriageScreen
      items={[MOCK_VOC]}
      selectedId={MOCK_VOC.id}
      activeTab={activeTab}
      onSelectVoc={vi.fn()}
      onTabChange={setActiveTab}
    />
  );
}

describe('VocTriageScreen — #852 expanded reading column', () => {
  it('fullscreen toggle keeps the same panel and toggle nodes', () => {
    render(
      <Wrapper>
        <ControlledTriageScreen />
      </Wrapper>,
    );

    const toggle = screen.getByRole('button', { name: '전체 화면 전환' });
    const panel = screen.getByTestId('triage-description-region');
    expect(screen.getByTestId('triage-panel-column')).toBeInTheDocument();

    // The column wrapper is always present, so toggling never remounts the panel.
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: '전체 화면 전환' })).toBe(toggle);
    expect(screen.getByTestId('triage-description-region')).toBe(panel);
    expect(screen.getByTestId('triage-panel-column')).toBeInTheDocument();
  });
});
