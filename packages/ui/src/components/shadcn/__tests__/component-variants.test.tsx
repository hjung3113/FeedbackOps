/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { Card, CardContent } from '../card.js';
import { DialogFooter } from '../dialog.js';
import { Select, SelectTrigger, SelectValue } from '../select.js';
import { Skeleton } from '../skeleton.js';
import { Tabs, TabsList, TabsTrigger } from '../tabs.js';
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

  it('preserves SourceContextSegmented classes for segmented Tabs', () => {
    const before = render(
      <Tabs value="direct">
        <TabsList className="inline-flex h-auto w-auto justify-start gap-0.5 rounded-md bg-surface-canvas p-0.5 text-text-muted shadow-subtle">
          <TabsTrigger
            value="direct"
            className="flex-none gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium data-[state=active]:bg-surface-card-elevated data-[state=active]:text-text-primary data-[state=active]:shadow-subtle"
          >
            Direct
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const oldListClasses = [
      ...(before.container.querySelector('[role="tablist"]')?.classList ?? []),
    ].sort();
    const oldTriggerClasses = [
      ...(before.container.querySelector('[role="tab"]')?.classList ?? []),
    ].sort();
    before.unmount();

    const after = render(
      <Tabs value="direct">
        <TabsList appearance="segmented">
          <TabsTrigger value="direct" appearance="segmented">
            Direct
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const variantListClasses = [
      ...(after.container.querySelector('[role="tablist"]')?.classList ?? []),
    ].sort();
    const variantTriggerClasses = [
      ...(after.container.querySelector('[role="tab"]')?.classList ?? []),
    ].sort();
    expect(variantListClasses).toEqual(oldListClasses);
    expect(variantTriggerClasses).toEqual(oldTriggerClasses);
  });

  it('preserves the Home filter track classes for ToggleGroup appearance=filter', () => {
    const oldClassName = 'w-fit rounded-md border border-border-subtle bg-surface-card p-0.5';
    const before = render(
      <ToggleGroup type="single" value="all" className={oldClassName}>
        <ToggleGroupItem value="all" appearance="selected-filter">
          All
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    const oldClasses = [...(before.container.firstElementChild as HTMLElement).classList].sort();
    before.unmount();

    const after = render(
      <ToggleGroup type="single" value="all" appearance="filter" className="w-fit">
        <ToggleGroupItem value="all" appearance="selected-filter">
          All
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    const variantClasses = [...(after.container.firstElementChild as HTMLElement).classList].sort();
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
