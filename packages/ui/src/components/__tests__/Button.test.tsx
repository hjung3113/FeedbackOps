/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { Button } from '../Button.js';

describe('Button component variants', () => {
  it.each([
    {
      name: 'compact icon spacing',
      oldClassName: 'gap-1.5',
      oldSize: 'sm' as const,
      variantProps: { size: 'sm' as const, spacing: 'compact' as const },
    },
    {
      name: 'compact horizontal padding',
      oldClassName: 'px-2',
      oldSize: 'sm' as const,
      variantProps: { size: 'sm' as const, padding: 'compact' as const },
    },
    {
      name: 'toolbar size',
      oldClassName: 'shrink-0 gap-1.5 px-2',
      oldSize: 'sm' as const,
      variantProps: { size: 'toolbar' as const },
    },
    {
      name: 'small icon size',
      oldClassName: 'h-8 w-8 p-0',
      oldSize: 'sm' as const,
      variantProps: { size: 'icon-sm' as const },
    },
    {
      name: 'extra small icon size',
      oldClassName: 'h-7 w-7 p-0',
      oldSize: 'sm' as const,
      variantProps: { size: 'icon-xs' as const },
    },
    {
      name: 'wrapped text at small size',
      oldClassName: 'h-auto min-h-8 py-1 whitespace-normal',
      oldSize: 'sm' as const,
      variantProps: { size: 'sm' as const, wrapText: true },
    },
    {
      name: 'wrapped text at default size',
      oldClassName: 'h-auto min-h-8 py-1 whitespace-normal',
      oldSize: undefined,
      variantProps: { wrapText: true },
    },
  ])('preserves legacy classes for $name', ({ oldClassName, oldSize, variantProps }) => {
    const before = render(
      <Button {...(oldSize === undefined ? {} : { size: oldSize })} className={oldClassName}>
        Action
      </Button>,
    );
    const oldClasses = [...screen.getByRole('button').classList].sort();
    before.unmount();

    render(<Button {...variantProps}>Action</Button>);
    const variantClasses = [...screen.getByRole('button').classList].sort();
    expect(variantClasses).toEqual(oldClasses);
  });
});
