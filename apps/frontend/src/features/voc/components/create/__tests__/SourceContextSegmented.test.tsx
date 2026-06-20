import { fireEvent, render, screen } from '@testing-library/react';
// Radix TabsTrigger activates on mousedown, not click.
import { describe, expect, it, vi } from 'vitest';
import { SourceContextSegmented } from '../SourceContextSegmented';

describe('<SourceContextSegmented>', () => {
  it('renders all 4 options', () => {
    render(
      <SourceContextSegmented
        value="direct_use"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('직접 사용')).toBeInTheDocument();
    expect(screen.getByText('타인 대신 보고')).toBeInTheDocument();
    expect(screen.getByText('운영 중 발견')).toBeInTheDocument();
    expect(screen.getByText('이해관계자 요청')).toBeInTheDocument();
  });

  it('renders as a compact icon segmented control instead of full-width tabs', () => {
    render(
      <SourceContextSegmented
        value="direct_use"
        onChange={() => {}}
        testId="source-context-segmented"
      />,
    );

    const control = screen.getByTestId('source-context-segmented');
    expect(control.querySelector('[data-testid="source-context-list"]')).toHaveClass('inline-flex');
    expect(control.querySelector('[data-testid="source-context-icon-direct_use"]')).toBeInTheDocument();
    expect(control.querySelector('[data-testid="source-context-icon-proxy_report"]')).toBeInTheDocument();
  });

  it('fires onChange with "proxy_report" when that tab is clicked', () => {
    const onChange = vi.fn();
    render(
      <SourceContextSegmented
        value="direct_use"
        onChange={onChange}
      />,
    );
    fireEvent.mouseDown(screen.getByText('타인 대신 보고'));
    expect(onChange).toHaveBeenCalledWith('proxy_report');
  });

  it('fires onChange with "operational_discovery" when that tab is clicked', () => {
    const onChange = vi.fn();
    render(
      <SourceContextSegmented
        value="direct_use"
        onChange={onChange}
      />,
    );
    fireEvent.mouseDown(screen.getByText('운영 중 발견'));
    expect(onChange).toHaveBeenCalledWith('operational_discovery');
  });

  it('fires onChange with "stakeholder_request" when that tab is clicked', () => {
    const onChange = vi.fn();
    render(
      <SourceContextSegmented
        value="direct_use"
        onChange={onChange}
      />,
    );
    fireEvent.mouseDown(screen.getByText('이해관계자 요청'));
    expect(onChange).toHaveBeenCalledWith('stakeholder_request');
  });

  it('fires onChange with "direct_use" when that tab is clicked', () => {
    const onChange = vi.fn();
    render(
      <SourceContextSegmented
        value="proxy_report"
        onChange={onChange}
      />,
    );
    fireEvent.mouseDown(screen.getByText('직접 사용'));
    expect(onChange).toHaveBeenCalledWith('direct_use');
  });
});
