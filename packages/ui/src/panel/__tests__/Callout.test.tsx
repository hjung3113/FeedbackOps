/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { Callout } from '../Callout.js';
import type { CalloutTone } from '../Callout.js';

const TONE_VAR: Record<CalloutTone, string> = {
  amber: '--color-amber',
  red: '--color-warning-red',
  blue: '--color-aether-blue',
  cyan: '--color-cyan-spark',
  emerald: '--color-emerald',
};

const BACKGROUND_ALPHA: Record<CalloutTone, string> = {
  amber: '0.08',
  red: '0.06',
  blue: '0.04',
  cyan: '0.06',
  emerald: '0.06',
};

const RING_ALPHA: Record<CalloutTone, string> = {
  amber: '0.3',
  red: '0.2',
  blue: '0.2',
  cyan: '0.2',
  emerald: '0.2',
};

const COLOR_CLASS: Record<CalloutTone, string> = {
  amber: 'text-accent-warn',
  red: 'text-accent-danger',
  blue: 'text-accent-primary',
  cyan: 'text-accent-info',
  emerald: 'text-accent-success',
};

const TITLE_CLASS: Record<CalloutTone, string> = {
  amber: 'text-text-warning-label',
  red: 'text-text-danger-label',
  blue: 'text-text-secondary',
  cyan: 'text-text-secondary',
  emerald: 'text-text-secondary',
};

const tones = Object.keys(TONE_VAR) as CalloutTone[];

describe('Callout — tone CSS variable mapping', () => {
  it.each(tones)('tone="%s" uses valid token colors for background, ring, and title', (tone) => {
    const { container } = render(
      <Callout tone={tone} title="제목" icon={<span data-testid="callout-icon" />}>
        내용
      </Callout>,
    );
    const el = container.firstElementChild as HTMLElement;

    expect(el).toHaveAttribute('data-tone', tone);
    expect(el.style.getPropertyValue('--callout-background')).toBe(
      `rgb(var(${TONE_VAR[tone]}) / ${BACKGROUND_ALPHA[tone]})`,
    );
    expect(el.style.getPropertyValue('--callout-ring')).toBe(
      `rgb(var(${TONE_VAR[tone]}) / ${RING_ALPHA[tone]}) 0 0 0 1px inset`,
    );
    expect(el.style.borderLeft).toBe('');
    expect(el.style.getPropertyValue('--callout-color')).toBe('');
    expect(el.style.getPropertyValue('--callout-title-color')).toBe('');
    expect(screen.getByTestId('callout-icon').parentElement).toHaveClass(COLOR_CLASS[tone]);
    expect(screen.getByText('제목')).toHaveClass(TITLE_CLASS[tone]);
  });

  it.each(tones)('tone="%s" colors the icon without a title', (tone) => {
    render(
      <Callout tone={tone} icon={<span data-testid="callout-icon" />}>
        내용
      </Callout>,
    );
    expect(screen.getByTestId('callout-icon').parentElement).toHaveClass(COLOR_CLASS[tone]);
  });
});

describe('Callout — content rendering', () => {
  it('renders children body', () => {
    render(<Callout tone="amber">경고 메시지입니다.</Callout>);
    expect(screen.getByText('경고 메시지입니다.')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(
      <Callout tone="blue" title="안내 제목">
        본문
      </Callout>,
    );
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
        action={
          <button type="button" data-testid="action-btn">
            조치
          </button>
        }
      >
        내용
      </Callout>,
    );
    expect(screen.getByTestId('action-btn')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <Callout tone="cyan" className="custom-callout">
        내용
      </Callout>,
    );
    expect(container.firstElementChild).toHaveClass('custom-callout');
  });
});
