import type { VocListItem } from '@fops/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  attachment_count: 0,
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
      <VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={MANAGED_SYSTEM} />,
    );
    expect(screen.getByText('Test VOC title')).toBeInTheDocument();
  });

  it('renders display_id', () => {
    render(
      <VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={MANAGED_SYSTEM} />,
    );
    expect(screen.getByText('VOC-001')).toBeInTheDocument();
  });

  it('renders ManagedSystemPill name when managedSystem provided', () => {
    render(
      <VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={MANAGED_SYSTEM} />,
    );
    expect(screen.getByText('Tableau')).toBeInTheDocument();
  });

  it('renders "Owner 필요" when both owner_user_id and owner_team_id are null', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    expect(screen.getByText('Owner 필요')).toBeInTheDocument();
  });

  it('does NOT render "Owner 필요" when an owner is resolved', () => {
    const vocWithOwner: VocListItem = { ...BASE_VOC, owner_user_id: 'user-2' };
    render(
      <VocRow
        voc={vocWithOwner}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
        owner={{ display_name: '박서연' }}
      />,
    );
    expect(screen.queryByText('Owner 필요')).not.toBeInTheDocument();
  });

  it('renders the SeverityBadge label on the meta line', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    // SeverityBadge for 'high' renders the Korean label 높음.
    expect(screen.getByText('높음')).toBeInTheDocument();
  });

  it('does NOT render a SeverityBadge when severity is null', () => {
    const vocNoSeverity: VocListItem = { ...BASE_VOC, severity: null };
    render(
      <VocRow voc={vocNoSeverity} selected={false} onSelect={onSelect} managedSystem={null} />,
    );
    expect(screen.queryByText('높음')).not.toBeInTheDocument();
  });

  it('renders the "N similar" badge only when similar_count > 0', () => {
    const { rerender } = render(
      <VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />,
    );
    expect(screen.queryByText(/similar/)).not.toBeInTheDocument();

    rerender(
      <VocRow
        voc={{ ...BASE_VOC, similar_count: 4 }}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    expect(screen.getByText('4 similar')).toBeInTheDocument();
  });

  it('renders amber "No area" when analytics_area_id is null', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    expect(screen.getByText('No area')).toBeInTheDocument();
  });

  it('renders the resolved area name instead of "No area" when present', () => {
    const vocWithArea: VocListItem = { ...BASE_VOC, analytics_area_id: 'area-1' };
    render(
      <VocRow
        voc={vocWithArea}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
        areaName="Finance"
      />,
    );
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.queryByText('No area')).not.toBeInTheDocument();
  });

  it('shows a checkbox and toggling it calls onToggleCheck without onSelect', () => {
    const onToggleCheck = vi.fn();
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
        onToggleCheck={onToggleCheck}
      />,
    );
    const checkbox = screen.getByLabelText('VOC-001 선택');
    fireEvent.click(checkbox);
    expect(onToggleCheck).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onSelect on click', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    fireEvent.click(screen.getByRole('row'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect on Enter key', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    fireEvent.keyDown(screen.getByRole('row'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect on Space key', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    fireEvent.keyDown(screen.getByRole('row'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('sets aria-selected=false when not selected', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    expect(screen.getByRole('row')).toHaveAttribute('aria-selected', 'false');
  });

  it('sets aria-selected=true when selected', () => {
    render(<VocRow voc={BASE_VOC} selected={true} onSelect={onSelect} managedSystem={null} />);
    expect(screen.getByRole('row')).toHaveAttribute('aria-selected', 'true');
  });

  it('applies the selected-row token + left accent bar when selected', () => {
    render(<VocRow voc={BASE_VOC} selected={true} onSelect={onSelect} managedSystem={null} />);
    const row = screen.getByRole('row');
    // Prototype parity: tinted selected background
    expect(row.className).toContain('bg-surface-row-selected');
    // Left edge bar exists and uses accent-primary color when selected
    const bar = row.querySelector('[data-testid="voc-row-left-bar"]');
    expect(bar).not.toBeNull();
    expect(bar?.className).toContain('bg-accent-primary');
  });

  it('has a bottom border divider on every row', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    const cls = screen.getByRole('row').className;
    expect(cls).toContain('border-b');
    expect(cls).toContain('border-border-subtle');
  });

  it('renders left-bar with severity-high class for high severity', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    const bar = screen.getByTestId('voc-row-left-bar');
    expect(bar).toBeInTheDocument();
    expect(bar.className).toContain('bg-severity-high');
  });

  it('renders left-bar with severity-low class for low severity', () => {
    const vocLow: VocListItem = { ...BASE_VOC, severity: 'low' };
    render(<VocRow voc={vocLow} selected={false} onSelect={onSelect} managedSystem={null} />);
    const bar = screen.getByTestId('voc-row-left-bar');
    expect(bar.className).toContain('bg-severity-low');
  });

  it('renders left-bar with severity-medium class for medium severity', () => {
    const vocMed: VocListItem = { ...BASE_VOC, severity: 'medium' };
    render(<VocRow voc={vocMed} selected={false} onSelect={onSelect} managedSystem={null} />);
    const bar = screen.getByTestId('voc-row-left-bar');
    expect(bar.className).toContain('bg-severity-medium');
  });

  it('renders left-bar with severity-critical class for critical severity', () => {
    const vocCrit: VocListItem = { ...BASE_VOC, severity: 'critical' };
    render(<VocRow voc={vocCrit} selected={false} onSelect={onSelect} managedSystem={null} />);
    const bar = screen.getByTestId('voc-row-left-bar');
    expect(bar.className).toContain('bg-severity-critical');
  });

  it('renders left-bar with neutral token when severity is null', () => {
    const vocNull: VocListItem = { ...BASE_VOC, severity: null };
    render(<VocRow voc={vocNull} selected={false} onSelect={onSelect} managedSystem={null} />);
    const bar = screen.getByTestId('voc-row-left-bar');
    expect(bar.className).toContain('bg-border-strong');
  });

  it('left-bar uses accent-primary when selected regardless of severity', () => {
    const vocNull: VocListItem = { ...BASE_VOC, severity: null };
    render(<VocRow voc={vocNull} selected={true} onSelect={onSelect} managedSystem={null} />);
    const bar = screen.getByTestId('voc-row-left-bar');
    expect(bar.className).toContain('bg-accent-primary');
    expect(bar.className).not.toContain('bg-border-strong');
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
      <VocRow voc={vocNoSeverity} selected={false} onSelect={onSelect} managedSystem={null} />,
    );
    // SeverityIndicator renders with data-severity attribute
    const indicator = container.querySelector('[data-severity]');
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute('data-severity')).toBe('low');
  });

  it('renders relative time in trailing area', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    // Should contain some Korean time text
    const rowEl = screen.getByRole('row');
    expect(rowEl.textContent).toMatch(/분|시간|일/);
  });
});
