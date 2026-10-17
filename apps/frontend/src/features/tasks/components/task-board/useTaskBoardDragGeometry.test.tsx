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
  // Columns in visual order are a, b, c, d (left edges 0, 300, 600, 900); `hidden` has no width.
  const ORDER = [
    ['hidden', 1200, 0],
    ['c', 600, 288],
    ['a', 0, 288],
    ['d', 900, 288],
    ['b', 300, 288],
  ] as const;

  function mountGetter(origin: string | null = 'a', lefts: Record<string, number> = {}) {
    const { result } = renderHook(useTaskBoardDragGeometry);
    const columns = ORDER.map(([id, x, width]) => {
      const { column, dropNode } = boardNodes();
      vi.spyOn(column, 'getBoundingClientRect').mockImplementation(
        () => new DOMRect(lefts[id] ?? x, 100, width, 700),
      );
      return { id, node: { current: dropNode }, disabled: false };
    });
    if (origin !== null) {
      act(() =>
        result.current.onDragStart({
          active: { id: 'task', data: { current: { task: { status: origin } } } },
          activatorEvent: new KeyboardEvent('keydown'),
        } as unknown as Parameters<typeof result.current.onDragStart>[0]),
      );
    }
    // The rect the sensor reports is deliberately unrelated to the tracked column.
    const press = (code: string, rectLeft = 16) =>
      result.current.coordinateGetter(new KeyboardEvent('keydown', { code }), {
        active: 'task',
        currentCoordinates: { x: rectLeft, y: 110 },
        context: {
          collisionRect: new DOMRect(rectLeft, 110, 256, 72),
          droppableContainers: { getEnabled: () => columns },
          draggableNodes: new Map([['task', { data: { current: { task: { status: 'c' } } } }]]),
        },
      } as unknown as Parameters<KeyboardCoordinateGetter>[1]);
    return { result, press };
  }
  // Column centre minus half the 256px card: the sensor wants the card's top-left corner.
  const centred = (left: number) => ({ x: left + 144 - 128, y: 110 });

  it.each(['ArrowUp', 'ArrowDown', 'Enter'])('does not move for %s', (code) => {
    expect(mountGetter().press(code)).toBeUndefined();
  });

  it('does not move when the origin column is unknown', () => {
    expect(mountGetter('missing').press('ArrowRight')).toBeUndefined();
  });

  it('advances exactly one column per press from a non-first origin, whatever the rect says', () => {
    const { press } = mountGetter('b');
    expect(press('ArrowRight', 5000)).toEqual(centred(600));
    expect(press('ArrowRight', -300)).toEqual(centred(900));
    expect(press('ArrowLeft', 17)).toEqual(centred(600));
    expect(press('ArrowLeft', 17)).toEqual(centred(300));
  });

  it('clamps at the last and first column without wrapping or snapping', () => {
    const { press } = mountGetter('c');
    expect(press('ArrowRight')).toEqual(centred(900));
    expect(press('ArrowRight')).toEqual(centred(900));
    expect(press('ArrowLeft')).toEqual(centred(600));
    expect(press('ArrowLeft')).toEqual(centred(300));
    expect(press('ArrowLeft')).toEqual(centred(0));
    expect(press('ArrowLeft')).toEqual(centred(0));
    expect(press('ArrowRight')).toEqual(centred(300));
  });

  it('follows live column rects when an auto-scroll has moved the board between presses', () => {
    const lefts: Record<string, number> = {};
    const { press } = mountGetter('a', lefts);
    expect(press('ArrowRight')).toEqual(centred(300));
    for (const [id, x] of [
      ['a', -400],
      ['b', -100],
      ['c', 200],
      ['d', 500],
    ] as const)
      lefts[id] = x;
    expect(press('ArrowRight')).toEqual(centred(200));
    expect(press('ArrowRight')).toEqual(centred(500));
  });

  it('forgets the tracked column when a drag ends or is cancelled and restarts from the new origin', () => {
    const { result, press } = mountGetter('a');
    expect(press('ArrowRight')).toEqual(centred(300));
    act(() => result.current.onDragEnd());
    act(() =>
      result.current.onDragStart({
        active: { id: 'task', data: { current: { task: { status: 'd' } } } },
        activatorEvent: new KeyboardEvent('keydown'),
      } as unknown as Parameters<typeof result.current.onDragStart>[0]),
    );
    expect(press('ArrowLeft')).toEqual(centred(600));
    act(() => result.current.reset());
    expect(press('ArrowLeft')).toEqual(centred(900 - 300 - 300));
  });

  it('falls back to the dragged Task status when no drag start was seen', () => {
    const { press } = mountGetter(null);
    expect(press('ArrowRight')).toEqual(centred(900));
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
