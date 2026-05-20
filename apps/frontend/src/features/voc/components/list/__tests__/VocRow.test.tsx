import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { VocListItem } from '@fops/shared';
import { VocRow } from '../VocRow';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_VOC: VocListItem = {
  id: '00000000-0000-0000-0000-000000000001',
  display_id: 'VOC-001',
  title: 'Test VOC title',
  primary_managed_system_id: 'ms-aaa',
  analytics_area_id: null,
  reporter_id: 'user-1',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  similar_count: 0,
};

const MANAGED_SYSTEM = {
  name: 'Tableau',
  mark: '#5e6ad2',
  archived: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<VocRow>', () => {
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
  });

  it('renders title in default variant', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={MANAGED_SYSTEM}
      />,
    );
    expect(screen.getByText('Test VOC title')).toBeInTheDocument();
  });

  it('renders display_id', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={MANAGED_SYSTEM}
      />,
    );
    expect(screen.getByText('VOC-001')).toBeInTheDocument();
  });

  it('renders ManagedSystemPill name when managedSystem provided', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={MANAGED_SYSTEM}
      />,
    );
    expect(screen.getByText('Tableau')).toBeInTheDocument();
  });

  it('renders "Owner 없음" when both owner_user_id and owner_team_id are null', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    expect(screen.getByText('Owner 없음')).toBeInTheDocument();
  });

  it('does NOT render "Owner 없음" when owner_user_id is set', () => {
    const vocWithOwner: VocListItem = { ...BASE_VOC, owner_user_id: 'user-2' };
    render(
      <VocRow
        voc={vocWithOwner}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    expect(screen.queryByText('Owner 없음')).not.toBeInTheDocument();
  });

  it('calls onSelect on click', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    fireEvent.click(screen.getByRole('row'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect on Enter key', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    fireEvent.keyDown(screen.getByRole('row'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect on Space key', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    fireEvent.keyDown(screen.getByRole('row'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('sets aria-selected=false when not selected', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    expect(screen.getByRole('row')).toHaveAttribute('aria-selected', 'false');
  });

  it('sets aria-selected=true when selected', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={true}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    expect(screen.getByRole('row')).toHaveAttribute('aria-selected', 'true');
  });

  it('applies bg-surface-detail class when selected', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={true}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    expect(screen.getByRole('row').className).toContain('bg-surface-detail');
  });

  it('renders permission-limited variant — title replaced by peek', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
        permissionLimited={true}
      />,
    );
    // Title should be absent
    expect(screen.queryByText('Test VOC title')).not.toBeInTheDocument();
    // display_id should be present
    expect(screen.getByText('VOC-001')).toBeInTheDocument();
  });

  it('applies opacity-60 in permission-limited variant', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
        permissionLimited={true}
      />,
    );
    expect(screen.getByRole('row').className).toContain('opacity-60');
  });

  it('renders dimmed SeverityIndicator when severity is null', () => {
    const vocNoSeverity: VocListItem = { ...BASE_VOC, severity: null };
    const { container } = render(
      <VocRow
        voc={vocNoSeverity}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    // SeverityIndicator renders with data-severity attribute
    const indicator = container.querySelector('[data-severity]');
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute('data-severity')).toBe('low');
  });

  it('renders relative time in trailing area', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    // Should contain some Korean time text
    const rowEl = screen.getByRole('row');
    expect(rowEl.textContent).toMatch(/분|시간|일/);
  });
});
