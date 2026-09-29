import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({ useQuery: useQueryMock }));

import { TaskRequestDraftCard } from '../TaskRequestDraftCard';

const sourceId = '22222222-2222-4222-8222-222222222222';

function renderCard(overrides: Partial<React.ComponentProps<typeof TaskRequestDraftCard>> = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  render(
    <TaskRequestDraftCard
      sourceKind="VOC"
      sourceDisplayId="VOC-100"
      evidenceSummaryDefault="Prefilled evidence summary"
      isSubmitting={false}
      onClose={onClose}
      onSubmit={onSubmit}
      source={{ type: 'voc', id: sourceId }}
      {...overrides}
    />,
  );
  return { onClose, onSubmit };
}

describe('TaskRequestDraftCard', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue({ data: { items: [] } });
  });

  it.each([
    { sourceKind: 'VOC' as const, sourceDisplayId: 'VOC-100' },
    { sourceKind: 'VOC Cluster' as const, sourceDisplayId: 'CLU-100' },
    { sourceKind: 'Finding' as const, sourceDisplayId: 'FIN-100' },
  ])('shows the source display id and kind for $sourceKind', ({ sourceKind, sourceDisplayId }) => {
    renderCard({ sourceKind, sourceDisplayId });

    const region = screen.getByRole('region', { name: 'Task Request draft' });
    expect(region).toHaveTextContent(`From ${sourceDisplayId} · ${sourceKind}`);
    expect(region).toHaveTextContent('Draft task request');
    expect(region).toHaveAttribute('data-testid', 'request-task-draft');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('prefills evidence and validates both required fields before submit', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCard();

    expect(screen.getByTestId('request-task-evidence-summary-input')).toHaveValue(
      'Prefilled evidence summary',
    );
    expect(screen.getByTestId('request-task-requested-outcome-input')).toHaveValue('');
    await user.clear(screen.getByTestId('request-task-evidence-summary-input'));
    await user.click(screen.getByTestId('request-task-submit'));

    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('focuses Evidence Summary when the inline card mounts', async () => {
    renderCard();

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByTestId('request-task-evidence-summary-input'),
      ),
    );
  });

  it('submits the two contract fields', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCard();
    await user.type(
      screen.getByTestId('request-task-requested-outcome-input'),
      'Reduce export wait time',
    );
    await user.click(screen.getByTestId('request-task-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      evidence_summary: 'Prefilled evidence summary',
      requested_outcome: 'Reduce export wait time',
    });
  });

  it('shows the pending request for this source inside the card', () => {
    useQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            display_id: 'REQ-1000',
            source_type: 'voc',
            source_id: sourceId,
          },
          {
            id: '33333333-3333-4333-8333-333333333333',
            display_id: 'REQ-1001',
            source_type: 'finding',
            source_id: '44444444-4444-4444-8444-444444444444',
          },
        ],
      },
    });
    renderCard();

    const card = screen.getByRole('region', { name: 'Task Request draft' });
    expect(within(card).getByTestId('request-task-pending-notice')).toHaveTextContent('REQ-1000');
    expect(within(card).getByRole('link', { name: 'REQ-1000' })).toHaveAttribute(
      'href',
      '/tasks?view=requests&param=11111111-1111-4111-8111-111111111111',
    );
    expect(within(card).getByTestId('request-task-submit')).toBeEnabled();
  });

  it('resets both fields and links to Task Requests', async () => {
    const user = userEvent.setup();
    renderCard();
    const evidence = screen.getByTestId('request-task-evidence-summary-input');
    const outcome = screen.getByTestId('request-task-requested-outcome-input');
    await user.clear(evidence);
    await user.type(evidence, 'Changed evidence');
    await user.type(outcome, 'Changed outcome');

    expect(screen.getByRole('link', { name: 'Review in Task Requests' })).toHaveAttribute(
      'href',
      '/tasks?view=requests',
    );
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(evidence).toHaveValue('Prefilled evidence summary');
    expect(outcome).toHaveValue('');
  });

  it('closes from the Close draft button or Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Close draft' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('returns focus to the element that opened it when it unmounts', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <TaskRequestDraftCard
        sourceKind="VOC"
        sourceDisplayId="VOC-100"
        evidenceSummaryDefault="Prefilled evidence summary"
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('request-task-evidence-summary-input')).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('links the validation error to the outcome field', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByTestId('request-task-submit'));

    const outcome = screen.getByTestId('request-task-requested-outcome-input');
    const errorId = outcome.getAttribute('aria-describedby')?.split(' ').pop();
    expect(document.getElementById(errorId ?? '')).toHaveAttribute('role', 'alert');
  });

  it('does not render Convert to Task fields and disables submit while submitting', () => {
    renderCard({ isSubmitting: true });

    expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Execution owner')).not.toBeInTheDocument();
    expect(screen.getByTestId('request-task-submit')).toBeDisabled();
  });
});
