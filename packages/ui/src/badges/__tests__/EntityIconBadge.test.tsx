/// <reference types="@testing-library/jest-dom" />
import { render } from '@testing-library/react';
import { ENTITY_ICON_MAP, EntityIconBadge, type EntityIconType } from '../EntityIconBadge.js';

const entityTypes = Object.keys(ENTITY_ICON_MAP) as EntityIconType[];

describe('EntityIconBadge', () => {
  it.each(entityTypes)('renders the token class pair for type="%s"', (type) => {
    const { letter, className } = ENTITY_ICON_MAP[type];
    const { container } = render(<EntityIconBadge type={type} />);
    const el = container.querySelector(`[data-entity-type="${type}"]`);

    expect(el).not.toBeNull();
    expect(el).toHaveClass(...className.split(' '));
    expect(el).toHaveAttribute('aria-label', type);
    expect(el).toHaveTextContent(letter);
  });

  it('keeps the data entity type attribute', () => {
    const { container } = render(<EntityIconBadge type="voc" />);
    const el = container.querySelector('[data-entity-type="voc"]');
    expect(el).toHaveAttribute('data-entity-type', 'voc');
  });

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
