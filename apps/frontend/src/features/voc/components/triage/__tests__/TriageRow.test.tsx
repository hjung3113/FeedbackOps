import type { VocListItem } from '@fops/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TriageRow } from '../TriageRow';

const BASE_VOC: VocListItem = {
  id: '00000000-0000-0000-0000-000000000001',
  display_id: 'VOC-001',
  title: 'Test VOC title',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: 'u1',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  similar_count: 0,
  attachment_count: 0,
};

describe('TriageRow', () => {
  it('mirrors prototype expanded row padding and min height', () => {
    render(<TriageRow voc={BASE_VOC} selected={false} onSelect={vi.fn()} />);
    const row = screen.getByRole('button');
    expect(row.className).toContain('min-h-[96px]');
    expect(row.className).toContain('py-3.5');
    expect(row.className).toContain('px-5');
  });

  it('renders the voc title and display_id', () => {
    render(<TriageRow voc={BASE_VOC} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Test VOC title')).toBeInTheDocument();
    expect(screen.getByText('VOC-001')).toBeInTheDocument();
  });

  it('shows "Owner 없음" when owner is unset', () => {
    render(<TriageRow voc={BASE_VOC} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Owner 없음')).toBeInTheDocument();
  });

  it('shows "Area 미지정" when analytics_area_id is null', () => {
    render(<TriageRow voc={BASE_VOC} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Area 미지정')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(<TriageRow voc={BASE_VOC} selected={false} onSelect={onSelect} />);
    const row = screen.getByRole('button');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('applies selected styling when selected=true', () => {
    render(<TriageRow voc={BASE_VOC} selected={true} onSelect={vi.fn()} />);
    const row = screen.getByRole('button');
    // Selected row should have a data-selected attribute or specific class
    expect(row).toHaveAttribute('aria-selected', 'true');
  });

  it('does NOT show "Owner 없음" when owner_user_id is set', () => {
    const vocWithOwner = { ...BASE_VOC, owner_user_id: 'u-owner-1' };
    render(<TriageRow voc={vocWithOwner} selected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText('Owner 없음')).not.toBeInTheDocument();
  });

  it('does NOT show "Area 미지정" when analytics_area_id is set', () => {
    const vocWithArea = { ...BASE_VOC, analytics_area_id: 'aa-1' };
    render(<TriageRow voc={vocWithArea} selected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText('Area 미지정')).not.toBeInTheDocument();
  });
});
