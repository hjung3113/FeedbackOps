import type { SourceContext } from '@fops/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SourceContextSegmented } from '../SourceContextSegmented';

const SOURCE_OPTIONS = [
  ['direct_use', '직접 사용'],
  ['proxy_report', '타인 대신 보고'],
  ['operational_discovery', '운영 중 발견'],
  ['stakeholder_request', '이해관계자 요청'],
] as const satisfies readonly (readonly [SourceContext, string])[];

interface RenderSourceContextOptions {
  value: SourceContext;
  onChange?: (next: SourceContext) => void;
  disabled?: boolean;
  testId?: string;
}

function renderSourceContext({
  value,
  onChange = () => {},
  disabled,
  testId,
}: RenderSourceContextOptions) {
  return render(
    <>
      <span id="source-context-label">출처</span>
      <SourceContextSegmented
        value={value}
        onChange={onChange}
        labelId="source-context-label"
        {...(disabled === undefined ? {} : { disabled })}
        {...(testId === undefined ? {} : { testId })}
      />
    </>,
  );
}

describe('<SourceContextSegmented>', () => {
  it('renders four named radios in a group named 출처 with the current value checked', () => {
    renderSourceContext({ value: 'direct_use' });

    const group = screen.getByRole('radiogroup', { name: '출처' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(4);

    for (const [, label] of SOURCE_OPTIONS) {
      expect(within(group).getByRole('radio', { name: label })).toBeInTheDocument();
    }
    expect(within(group).getByRole('radio', { name: '직접 사용' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('keeps the compact segmented control and icon test ids', () => {
    renderSourceContext({ value: 'direct_use', testId: 'source-context-segmented' });

    const wrapper = screen.getByTestId('source-context-segmented');
    const group = screen.getByTestId('source-context-list');
    expect(wrapper).toContainElement(group);
    expect(group).toHaveClass('inline-flex');
    expect(screen.getByTestId('source-context-icon-direct_use')).toBeInTheDocument();
    expect(screen.getByTestId('source-context-icon-proxy_report')).toBeInTheDocument();
  });

  it.each(SOURCE_OPTIONS)('fires onChange with %s when selected', (value, label) => {
    const onChange = vi.fn();
    renderSourceContext({
      value: value === 'direct_use' ? 'proxy_report' : 'direct_use',
      onChange,
    });

    fireEvent.click(screen.getByRole('radio', { name: label }));
    expect(onChange).toHaveBeenCalledWith(value);
  });

  it('selects the next value with ArrowRight from the checked radio', async () => {
    const onChange = vi.fn();
    renderSourceContext({ value: 'direct_use', onChange });

    const user = userEvent.setup();
    const checkedRadio = screen.getByRole('radio', { name: '직접 사용' });
    await user.tab();
    await waitFor(() => expect(document.activeElement).toBe(checkedRadio));
    fireEvent.keyDown(checkedRadio, { key: 'ArrowRight', code: 'ArrowRight' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('proxy_report'));
  });

  it('disables all four radios when disabled', () => {
    renderSourceContext({ value: 'direct_use', disabled: true });

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    for (const radio of radios) expect(radio).toBeDisabled();
  });
});
