import type { KeyboardCoordinateGetter } from '@dnd-kit/core';
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTaskBoardDragGeometry } from './useTaskBoardDragGeometry';

function boardNodes() {
  const board = document.createElement('div');
  const column = document.createElement('section');
  column.dataset.taskBoardColumn = '';
  const columnScroller = document.createElement('div');
  const dropNode = document.createElement('div');
  columnScroller.append(dropNode);
  column.append(columnScroller);
  board.append(column);
  return { board, column, columnScroller, dropNode };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Task board drag geometry', () => {
  function coordinates(code: string, left: number) {
    const { result } = renderHook(useTaskBoardDragGeometry);
    const columns = [600, 0, 300, 900].map((x, index) => {
      const { column, dropNode } = boardNodes();
      vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(x, 100, index === 3 ? 0 : 288, 700),
      );
      return { id: String(x), node: { current: dropNode }, disabled: false };
    });
    return result.current.coordinateGetter(new KeyboardEvent('keydown', { code }), {
      active: 'task',
      currentCoordinates: { x: left, y: 110 },
      context: {
        collisionRect: new DOMRect(left, 110, 256, 72),
        droppableContainers: { getEnabled: () => columns },
      },
    } as unknown as Parameters<KeyboardCoordinateGetter>[1]);
  }

  it.each([
    ['ArrowLeft', 16],
    ['ArrowRight', 616],
    ['ArrowUp', 16],
    ['ArrowDown', 16],
  ])('does not move for %s at x=%s', (code, left) => {
    expect(coordinates(String(code), Number(left))).toBeUndefined();
  });

  it('centres the active rect in the next live column in visual order', () => {
    expect(coordinates('ArrowRight', 16)).toEqual({ x: 316, y: 110 });
  });

  it('snaps from outside every column using the nearest column', () => {
    expect(coordinates('ArrowRight', -500)).toEqual({ x: 16, y: 110 });
  });

  it('allows board auto-scroll only at its own edges and keeps column scrolling eligible', async () => {
    const { result } = renderHook(useTaskBoardDragGeometry);
    const { board, columnScroller } = boardNodes();
    result.current.boardScroller.current = board;
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(new DOMRect(292, 100, 1147, 700));
    act(() =>
      result.current.onDragStart({
        activatorEvent: new MouseEvent('pointerdown', { clientX: 600, clientY: 400 }),
      }),
    );
    expect(result.current.autoScroll?.canScroll).toEqual(expect.any(Function));
    for (const [x, eligible] of [
      [845, false],
      [1140, false],
      [1430, true],
      [300, true],
    ] as const) {
      fireEvent(document, new MouseEvent('pointermove', { clientX: x, clientY: 400 }));
      expect(result.current.autoScroll?.canScroll?.(board)).toBe(eligible);
      expect(result.current.autoScroll?.canScroll?.(columnScroller)).toBe(true);
    }
  });

  it('keeps the hovered column scroller in dnd-kit ancestors with full-column drop bounds', async () => {
    const { getScrollableAncestors } =
      await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
    const { result } = renderHook(useTaskBoardDragGeometry);
    const { column, board, columnScroller, dropNode } = boardNodes();
    result.current.boardScroller.current = board;
    columnScroller.style.overflowY = 'auto';
    board.style.overflowX = 'auto';
    expect(getScrollableAncestors(dropNode)).toEqual([columnScroller, board]);
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(new DOMRect(292, 100, 288, 700));
    expect(result.current.measuring?.droppable?.measure?.(dropNode)).toMatchObject({
      left: 292,
      top: 100,
      width: 288,
      height: 700,
    });
    // Even after the inner ref scrolls, the column header remains a valid drop target.
    const collisions = result.current.collisionDetection?.({
      active: {
        id: 'task',
        data: { current: {} },
        rect: { current: { initial: null, translated: null } },
      },
      pointerCoordinates: null,
      collisionRect: new DOMRect(300, 110, 256, 72),
      droppableRects: new Map([['backlog', new DOMRect(292, -800, 288, 700)]]),
      droppableContainers: [
        {
          id: 'backlog',
          key: 'backlog',
          disabled: false,
          node: { current: dropNode },
          rect: { current: null },
          data: { current: {} },
        },
      ],
    });
    expect(collisions?.map(({ id }) => id)).toEqual(['backlog']);
  });
});
