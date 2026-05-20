import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  Button,
  Input,
  Textarea,
  Label,
  Card,
  Dialog,
  DialogContent,
  AlertDialog,
  Alert,
  Tooltip,
  TooltipProvider,
  HoverCard,
  Popover,
  Sheet,
  Tabs,
  Skeleton,
  Avatar,
  Badge,
  DropdownMenu,
  Checkbox,
  RadioGroup,
  ToggleGroup,
  Select,
  Combobox,
} from '../src/index';

describe('shadcn primitives smoke', () => {
  it('mount without throwing', () => {
    expect(() => render(<Button>OK</Button>)).not.toThrow();
    expect(() => render(<Input />)).not.toThrow();
    expect(() => render(<Textarea />)).not.toThrow();
    expect(() => render(<Label>L</Label>)).not.toThrow();
    expect(() => render(<Skeleton className="h-4 w-10" />)).not.toThrow();
    expect(() => render(<Badge>B</Badge>)).not.toThrow();
    expect(() => render(<Alert><div>A</div></Alert>)).not.toThrow();
    expect(() => render(<Card><div>C</div></Card>)).not.toThrow();
    // composite root primitives — render the open=false initial state
    expect(() => render(<Dialog><DialogContent>D</DialogContent></Dialog>)).not.toThrow();
    expect(() => render(<Tabs defaultValue="a"><div>T</div></Tabs>)).not.toThrow();
    expect(() =>
      render(
        <TooltipProvider>
          <Tooltip><div>X</div></Tooltip>
        </TooltipProvider>,
      ),
    ).not.toThrow();
    expect(() => render(<HoverCard><div>X</div></HoverCard>)).not.toThrow();
    expect(() => render(<Popover><div>P</div></Popover>)).not.toThrow();
    expect(() => render(<Sheet><div>S</div></Sheet>)).not.toThrow();
    expect(() => render(<AlertDialog><div>AD</div></AlertDialog>)).not.toThrow();
    expect(() => render(<DropdownMenu><div>DM</div></DropdownMenu>)).not.toThrow();
    expect(() => render(<Checkbox />)).not.toThrow();
    expect(() => render(<RadioGroup defaultValue="a"><div /></RadioGroup>)).not.toThrow();
    expect(() => render(<ToggleGroup type="single"><div /></ToggleGroup>)).not.toThrow();
    expect(() => render(<Select><div /></Select>)).not.toThrow();
    expect(() => render(<Avatar><div /></Avatar>)).not.toThrow();
    expect(() =>
      render(<Combobox options={[]} value={null} onChange={() => {}} />),
    ).not.toThrow();
  });
});
