// OwnerPicker.test.tsx — TDD RED tests for the owner picker component.
// Prototype ref: screen-voc-create.jsx:466-491
// Renders Combobox when candidates > 5, RadioGroup-style rows otherwise.
// "(미지정)" always at top. onChange passes { ownerUserId, ownerTeamId }.

import { vocOwnerCandidatesSchema } from '@fops/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OwnerPicker } from '../OwnerPicker';
import type { OwnerCandidate } from '../OwnerPicker';

function makeCandidate(i: number): OwnerCandidate {
  return {
    id: `user-${i}`,
    display_name: `User ${i}`,
    kind: 'user',
    meta: `담당 시스템: System ${i}`,
  };
}

const FEW = Array.from({ length: 3 }, (_, i) => makeCandidate(i + 1));
const MANY = Array.from({ length: 6 }, (_, i) => makeCandidate(i + 1));

describe('OwnerPicker', () => {
  it('always renders "(미지정)" option at the top', () => {
    render(<OwnerPicker candidates={FEW} value={null} onChange={vi.fn()} />);
    const firstBtn = screen.getAllByRole('button')[0];
    expect(firstBtn).toHaveTextContent('미지정');
  });

  it('renders RadioGroup-style rows when candidates ≤ 5', () => {
    render(<OwnerPicker candidates={FEW} value={null} onChange={vi.fn()} />);
    // Should render the candidate names as buttons
    expect(screen.getByText('User 1')).toBeInTheDocument();
    expect(screen.getByText('User 2')).toBeInTheDocument();
    expect(screen.getByText('User 3')).toBeInTheDocument();
  });

  it('renders Combobox trigger when candidates > 5', () => {
    render(<OwnerPicker candidates={MANY} value={null} onChange={vi.fn()} />);
    // Combobox pattern: a single trigger button with role=combobox
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('calls onChange with ownerUserId when a user row is clicked (RadioGroup mode)', () => {
    const onChange = vi.fn();
    render(<OwnerPicker candidates={FEW} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText('User 1'));
    expect(onChange).toHaveBeenCalledWith({ ownerUserId: 'user-1', ownerTeamId: null });
  });

  it('calls onChange with null values when "(미지정)" is clicked', () => {
    const onChange = vi.fn();
    render(<OwnerPicker candidates={FEW} value="user-1" onChange={onChange} />);
    const allButtons = screen.getAllByRole('button');
    const firstBtn = allButtons[0];
    if (firstBtn) fireEvent.click(firstBtn); // first = 미지정
    expect(onChange).toHaveBeenCalledWith({ ownerUserId: null, ownerTeamId: null });
  });
});

describe('OwnerPicker eligibility (#1172)', () => {
  it.each([3, 6])('disables retained ineligible owners with %i candidates', async (count) => {
    const actors = vocOwnerCandidatesSchema.parse({
      actors: Array.from({ length: count }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        display_name: i === 0 ? '권한 만료 담당자' : `가능 담당자 ${i}`,
        eligible: i !== 0,
      })),
    }).actors;
    const candidates = actors.map((actor) => ({ ...actor, kind: 'user' as const }));
    const onChange = vi.fn();
    render(
      <OwnerPicker candidates={candidates} value={actors[0]?.id ?? null} onChange={onChange} />,
    );
    if (count > 5) fireEvent.click(screen.getByRole('combobox'));
    const role = count > 5 ? 'option' : 'button';
    const retained = await screen.findByRole(role, {
      name: /권한 만료 담당자.*배정에 필요한 권한이 없습니다/,
    });
    if (count > 5) expect(retained).toHaveAttribute('aria-disabled', 'true');
    else expect(retained).toBeDisabled();
    fireEvent.click(retained);
    expect(onChange).not.toHaveBeenCalled();
    if (count > 5) {
      const search = screen.getByPlaceholderText('이름으로 검색…');
      fireEvent.change(search, { target: { value: '권한 만료' } });
      fireEvent.keyDown(search, { key: 'ArrowDown' });
      fireEvent.keyDown(search, { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.change(search, { target: { value: '' } });
    }
    fireEvent.click(screen.getByRole(role, { name: /가능 담당자 1/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ownerUserId: actors[1]?.id, ownerTeamId: null });
    if (count > 5) fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole(role, { name: '(미지정)' }));
    expect(onChange).toHaveBeenLastCalledWith({ ownerUserId: null, ownerTeamId: null });
  });
});
