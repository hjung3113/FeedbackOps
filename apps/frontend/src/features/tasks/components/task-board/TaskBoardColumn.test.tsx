import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskBoardColumn } from './TaskBoardColumn';

const droppableNodes = vi.hoisted(() => new Map<string, HTMLElement>());

vi.mock('@dnd-kit/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dnd-kit/core')>()),
  useDroppable: ({ id }: { id: string }) => ({
    setNodeRef: (node: HTMLElement | null) => {
      if (node) droppableNodes.set(id, node);
    },
    isOver: false,
  }),
}));

afterEach(() => {
  cleanup();
  droppableNodes.clear();
});

describe('TaskBoardColumn', () => {
  it('registers its droppable inside the column scroller so both scroll axes stay reachable', async () => {
    const { getScrollableAncestors } =
      await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
    render(
      <div data-testid="board">
        <TaskBoardColumn
          id="backlog"
          label="Backlog"
          tasks={[]}
          groupBy="status"
          selectedId={null}
          selectTask={() => {}}
          names={{ systems: new Map(), actors: new Map() }}
          enabled
        />
      </div>,
    );
    const board = screen.getByTestId('board');
    const column = screen.getByLabelText('Backlog 열');
    const columnScroller = column.querySelector('.overflow-y-auto') as HTMLElement;
    // jsdom applies no Tailwind CSS; mirror the scroll styles the classes give in the browser.
    columnScroller.style.overflowY = 'auto';
    board.style.overflowX = 'auto';
    expect(getScrollableAncestors(droppableNodes.get('backlog') ?? null)).toEqual([
      columnScroller,
      board,
    ]);
  });
});
