/// <reference types="@testing-library/jest-dom" />
import { render } from '@testing-library/react';
import { RichContentRenderer } from '../RichContentRenderer.js';
import type { TipTapDoc } from '../RichEditor.js';

const emptyDoc: TipTapDoc = { type: 'doc', content: [] };

describe('RichContentRenderer variants', () => {
  it.each([['small text', 'text-sm']])('preserves legacy classes for %s', (_name, oldClassName) => {
    const before = render(
      <RichContentRenderer doc={emptyDoc} mode="reporter_visible" className={oldClassName} />,
    );
    const oldClasses = [...(before.container.firstElementChild?.classList ?? [])].sort();
    before.unmount();

    const after = render(<RichContentRenderer doc={emptyDoc} mode="reporter_visible" size="sm" />);
    const variantClasses = [...(after.container.firstElementChild?.classList ?? [])].sort();
    expect(variantClasses).toEqual(oldClasses);
  });
});
