/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { EntityIconBadge, ENTITY_ICON_MAP, type EntityIconType } from '../EntityIconBadge.js';

const entityTypes = Object.keys(ENTITY_ICON_MAP) as EntityIconType[];

describe('EntityIconBadge', () => {
  entityTypes.forEach((type) => {
    const { letter, bg, color } = ENTITY_ICON_MAP[type];

    it(`renders letter "${letter}" for type="${type}"`, () => {
      render(<EntityIconBadge type={type} />);
      expect(screen.getByText(letter)).toBeInTheDocument();
    });

    it(`sets data-bg="${bg}" for type="${type}"`, () => {
      const { container } = render(<EntityIconBadge type={type} />);
      const el = container.querySelector(`[data-entity-type="${type}"]`);
      expect(el).not.toBeNull();
      expect(el?.getAttribute('data-bg')).toBe(bg);
    });

    it(`sets data-color="${color}" for type="${type}"`, () => {
      const { container } = render(<EntityIconBadge type={type} />);
      const el = container.querySelector(`[data-entity-type="${type}"]`);
      expect(el?.getAttribute('data-color')).toBe(color);
    });
  });

  it('defaults to size=22', () => {
    const { container } = render(<EntityIconBadge type="voc" />);
    const el = container.querySelector('[data-entity-type="voc"]') as HTMLElement;
    expect(el.style.width).toBe('22px');
    expect(el.style.height).toBe('22px');
  });

  it('uses border-radius 4 when size ≤ 18', () => {
    const { container } = render(<EntityIconBadge type="voc" size={18} />);
    const el = container.querySelector('[data-entity-type="voc"]') as HTMLElement;
    expect(el.style.borderRadius).toBe('4px');
  });

  it('uses border-radius 6 when size > 18', () => {
    const { container } = render(<EntityIconBadge type="voc" size={22} />);
    const el = container.querySelector('[data-entity-type="voc"]') as HTMLElement;
    expect(el.style.borderRadius).toBe('6px');
  });
});
