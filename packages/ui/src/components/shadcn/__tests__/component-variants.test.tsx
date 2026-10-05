/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { Card, CardContent } from '../card.js';
import { DialogFooter } from '../dialog.js';
import { Select, SelectTrigger, SelectValue } from '../select.js';
import { Skeleton } from '../skeleton.js';
import { ToggleGroup, ToggleGroupItem } from '../toggle-group.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip.js';

describe('shadcn component variants', () => {
  it.each([['compact footer spacing', 'gap-2 sm:gap-2']])(
    'preserves DialogFooter legacy classes for %s',
    (_name, oldClassName) => {
      const before = render(<DialogFooter className={oldClassName} />);
      const oldClasses = [...(before.container.firstElementChild?.classList ?? [])].sort();
      before.unmount();

      const after = render(<DialogFooter spacing="compact" />);
      const variantClasses = [...(after.container.firstElementChild?.classList ?? [])].sort();
      expect(variantClasses).toEqual(oldClasses);
    },
  );

  it.each([['compact card padding', 'p-3.5']])(
    'preserves Card legacy classes for %s',
    (_name, oldClassName) => {
      const before = render(<Card className={oldClassName} />);
      const oldClasses = [...(before.container.firstElementChild?.classList ?? [])].sort();
      before.unmount();

      const after = render(<Card padding="compact" />);
      const variantClasses = [...(after.container.firstElementChild?.classList ?? [])].sort();
      expect(variantClasses).toEqual(oldClasses);
    },
  );

  it.each([['zero content padding', 'p-0']])(
    'preserves CardContent legacy classes for %s',
    (_name, oldClassName) => {
      const before = render(<CardContent className={oldClassName} />);
      const oldClasses = [...(before.container.firstElementChild?.classList ?? [])].sort();
      before.unmount();

      const after = render(<CardContent padding="none" />);
      const variantClasses = [...(after.container.firstElementChild?.classList ?? [])].sort();
      expect(variantClasses).toEqual(oldClasses);
    },
  );

  it.each([
    [
      'canvas select appearance',
      'rounded border-border-subtle bg-surface-canvas p-2',
      'canvas',
      'default',
    ],
    [
      'field select appearance',
      'h-9 w-full rounded-md border-border-default bg-surface-field px-3 py-1 text-sm text-text-primary',
      'field',
      'default',
    ],
    ['compact trigger density', 'h-8 px-2 py-1', 'default', 'compact'],
  ] as const)(
    'preserves SelectTrigger legacy classes for %s',
    (_name, oldClassName, appearance, density) => {
      const before = render(
        <Select value="" onValueChange={() => {}}>
          <SelectTrigger className={oldClassName}>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );
      const oldClasses = [...screen.getByRole('combobox').classList].sort();
      before.unmount();

      render(
        <Select value="" onValueChange={() => {}}>
          <SelectTrigger appearance={appearance} density={density}>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );
      const variantClasses = [...screen.getByRole('combobox').classList].sort();
      expect(variantClasses).toEqual(oldClasses);
    },
  );

  it.each([
    [
      'selected filter item',
      'data-[state=on]:border-border-selected data-[state=on]:bg-surface-row-selected data-[state=on]:text-text-primary data-[state=on]:font-semibold',
    ],
  ])('preserves ToggleGroupItem legacy classes for %s', (_name, oldClassName) => {
    const before = render(
      <ToggleGroup type="single" value="all">
        <ToggleGroupItem value="all" className={oldClassName}>
          All
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    const oldClasses = [...screen.getByRole('radio').classList].sort();
    before.unmount();

    render(
      <ToggleGroup type="single" value="all">
        <ToggleGroupItem value="all" appearance="selected-filter">
          All
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    const variantClasses = [...screen.getByRole('radio').classList].sort();
    expect(variantClasses).toEqual(oldClasses);
  });

  it.each([['rounded rows', 'rounded']])(
    'preserves Skeleton legacy classes for %s',
    (_name, oldClassName) => {
      const before = render(<Skeleton className={oldClassName} />);
      const oldClasses = [...(before.container.firstElementChild?.classList ?? [])].sort();
      before.unmount();

      const after = render(<Skeleton shape="rounded" />);
      const variantClasses = [...(after.container.firstElementChild?.classList ?? [])].sort();
      expect(variantClasses).toEqual(oldClasses);
    },
  );

  it.each([['small tooltip text', 'text-xs']])(
    'preserves TooltipContent legacy classes for %s',
    (_name, oldClassName) => {
      const before = render(
        <TooltipProvider>
          <Tooltip open>
            <TooltipTrigger>Open</TooltipTrigger>
            <TooltipContent className={oldClassName}>Help</TooltipContent>
          </Tooltip>
        </TooltipProvider>,
      );
      const oldClasses = [...screen.getByRole('tooltip').classList].sort();
      before.unmount();

      render(
        <TooltipProvider>
          <Tooltip open>
            <TooltipTrigger>Open</TooltipTrigger>
            <TooltipContent size="sm">Help</TooltipContent>
          </Tooltip>
        </TooltipProvider>,
      );
      const variantClasses = [...screen.getByRole('tooltip').classList].sort();
      expect(variantClasses).toEqual(oldClasses);
    },
  );
});
