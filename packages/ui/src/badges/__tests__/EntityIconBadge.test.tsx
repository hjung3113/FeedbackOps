/// <reference types="@testing-library/jest-dom" />
import { render } from '@testing-library/react';
import { EntityIconBadge, type EntityIconType } from '../EntityIconBadge.js';

// Literal per-type pairs (not read back from ENTITY_ICON_MAP) so a swapped or
// shared token pair fails here.
const ENTITY_ICON_CASES = [
  ['voc', 'V', 'bg-entity-icon-voc', 'text-entity-icon-foreground-light'],
  ['evidence', 'E', 'bg-entity-icon-evidence', 'text-entity-icon-foreground-light'],
  ['finding', 'F', 'bg-entity-icon-finding', 'text-entity-icon-foreground-dark'],
  ['request', 'R', 'bg-entity-icon-request', 'text-entity-icon-foreground-dark'],
  ['task', 'T', 'bg-entity-icon-task', 'text-entity-icon-foreground-light'],
  ['survey', 'S', 'bg-entity-icon-survey', 'text-entity-icon-foreground-light'],
  ['outcome', 'O', 'bg-entity-icon-survey', 'text-entity-icon-foreground-light'],
] as const satisfies readonly (readonly [EntityIconType, string, string, string])[];

describe('EntityIconBadge', () => {
  it.each(ENTITY_ICON_CASES)(
    'renders type="%s" as %s with %s / %s',
    (type, letter, backgroundClass, foregroundClass) => {
      const { container } = render(<EntityIconBadge type={type} />);
      const el = container.querySelector(`[data-entity-type="${type}"]`);

      expect(el).not.toBeNull();
      expect(el).toHaveClass(backgroundClass, foregroundClass);
      expect(el).toHaveAttribute('aria-label', type);
      expect(el).toHaveTextContent(letter);
    },
  );

  it('defaults to size=22', () => {
    const { container } = render(<EntityIconBadge type="voc" />);
    const el = container.querySelector('[data-entity-type="voc"]') as HTMLElement;
    expect(el.style.getPropertyValue('--entity-icon-size')).toBe('22px');
  });

  it('uses border-radius 4 when size ≤ 18', () => {
    const { container } = render(<EntityIconBadge type="voc" size={18} />);
    const el = container.querySelector('[data-entity-type="voc"]') as HTMLElement;
    expect(el.style.getPropertyValue('--entity-icon-radius')).toBe('4px');
  });

  it('uses border-radius 6 when size > 18', () => {
    const { container } = render(<EntityIconBadge type="voc" size={22} />);
    const el = container.querySelector('[data-entity-type="voc"]') as HTMLElement;
    expect(el.style.getPropertyValue('--entity-icon-radius')).toBe('6px');
  });
});
