/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { Callout } from '../Callout.js';
import type { CalloutTone } from '../Callout.js';

const TONE_VAR: Record<CalloutTone, string> = {
  amber:   '--color-amber',
  red:     '--color-warning-red',
  blue:    '--color-aether-blue',
  cyan:    '--color-cyan-spark',
  emerald: '--color-emerald',
};

const tones = Object.keys(TONE_VAR) as CalloutTone[];

describe('Callout — tone CSS variable mapping', () => {
  tones.forEach((tone) => {
    it(`tone="${tone}" sets data-tone attribute`, () => {
      const { container } = render(<Callout tone={tone}>내용</Callout>);
      const el = container.querySelector(`[data-tone="${tone}"]`);
      expect(el).not.toBeNull();
    });

    it(`tone="${tone}" uses correct CSS variable in border-left style`, () => {
      const { container } = render(<Callout tone={tone}>내용</Callout>);
      const el = container.querySelector(`[data-tone="${tone}"]`) as HTMLElement | null;
      expect(el).not.toBeNull();
      expect(el!.style.borderLeft).toContain(`var(${TONE_VAR[tone]})`);
    });
  });
});

describe('Callout — content rendering', () => {
  it('renders children body', () => {
    render(<Callout tone="amber">경고 메시지입니다.</Callout>);
    expect(screen.getByText('경고 메시지입니다.')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<Callout tone="blue" title="안내 제목">본문</Callout>);
    expect(screen.getByText('안내 제목')).toBeInTheDocument();
  });

  it('renders icon slot when provided', () => {
    render(
      <Callout tone="red" icon={<span data-testid="icon-el">!</span>}>
        내용
      </Callout>,
    );
    expect(screen.getByTestId('icon-el')).toBeInTheDocument();
  });

  it('renders action slot when provided', () => {
    render(
      <Callout
        tone="emerald"
        action={<button type="button" data-testid="action-btn">조치</button>}
      >
        내용
      </Callout>,
    );
    expect(screen.getByTestId('action-btn')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Callout tone="cyan" className="custom-callout">내용</Callout>);
    expect(container.firstElementChild).toHaveClass('custom-callout');
  });
});
