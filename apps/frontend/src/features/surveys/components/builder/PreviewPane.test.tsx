import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Survey } from '../../types';
import { PreviewPane } from './PreviewPane';

const survey: Survey = {
  id: 'survey-1',
  display_id: 'SRV-1',
  title: 'Q3 사용성 진단',
  type: 'discovery',
  status: 'draft',
  description: '설문 설명',
  primary_managed_system_id: 'system-1',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: 'actor-1',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [
    {
      id: 'question-1',
      survey_id: 'survey-1',
      kind: 'single_choice',
      prompt: '도움이 되었나요?',
      is_required: true,
      options: [
        { key: 'yes', label: '예' },
        { key: 'no', label: '아니오' },
      ],
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      sort_order: 0,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
  ],
};

function renderPreview(draft: Survey = structuredClone(survey)) {
  function Harness() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <section data-testid="survey-editor">
          <label>
            Draft title
            <input defaultValue={draft.title} />
          </label>
        </section>
        <PreviewPane survey={draft} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  render(<Harness />);
  return { draft };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('survey respondent preview modal', () => {
  it('opens an accessible modal and makes the editor behind it inert', async () => {
    renderPreview();

    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));

    expect(await screen.findByRole('dialog', { name: 'Respondent preview' })).toBeInTheDocument();
    expect(
      screen.getByTestId('survey-editor').closest('[aria-hidden="true"], [inert]'),
    ).not.toBeNull();
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  });

  it.each([
    ['Escape', () => fireEvent.keyDown(document.body, { key: 'Escape' })],
    [
      'the shared close button',
      () => fireEvent.click(screen.getByRole('button', { name: 'Close' })),
    ],
  ])('closes with %s and returns focus to Preview', async (_label, close) => {
    renderPreview();
    const trigger = screen.getByRole('button', { name: '미리보기' });
    fireEvent.click(trigger);
    await screen.findByRole('dialog', { name: 'Respondent preview' });

    close();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the preview dialog', async () => {
    const user = userEvent.setup();
    renderPreview();
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));

    const dialog = await screen.findByRole('dialog', { name: 'Respondent preview' });
    const firstFocusable = within(dialog).getByRole('radio', { name: '예' });
    const lastFocusable = within(dialog).getByRole('button', { name: 'Close' });

    firstFocusable.focus();
    await user.tab({ shift: true });
    expect(lastFocusable).toHaveFocus();

    await user.tab();
    expect(firstFocusable).toHaveFocus();
  });

  it('keeps the draft unchanged and sends no request when preview answers are submitted', async () => {
    const draft = structuredClone(survey);
    const before = structuredClone(draft);
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    renderPreview(draft);

    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    await screen.findByRole('dialog', { name: 'Respondent preview' });
    fireEvent.click(screen.getByRole('radio', { name: '예' }));
    fireEvent.click(screen.getByRole('button', { name: '제출 (미리보기)' }));
    expect(await screen.findByText('응답이 제출되었습니다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(draft).toEqual(before);
    expect(request).not.toHaveBeenCalled();
  });
});
