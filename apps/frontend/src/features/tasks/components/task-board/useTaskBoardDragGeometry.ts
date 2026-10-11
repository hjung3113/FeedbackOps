import {
  type CollisionDetection,
  type DragStartEvent,
  getClientRect,
  rectIntersection,
} from '@dnd-kit/core';
import * as React from 'react';

const BOARD_SCROLL_THRESHOLD = { x: 0.2, y: 0.2 };
const outerColumnRect = (node: HTMLElement) =>
  getClientRect(node.closest('[data-task-board-column]') ?? node);

export function useTaskBoardDragGeometry() {
  const boardScroller = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const pointer = React.useRef<{ x: number; y: number } | null>(null);
  React.useEffect(() => {
    if (!dragging || !pointer.current) return;
    const trackPointer = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    // Read actual client coordinates; dnd-kit's drag delta also includes scroll offsets.
    document.addEventListener('pointermove', trackPointer, true);
    return () => document.removeEventListener('pointermove', trackPointer, true);
  }, [dragging]);
  const canScroll = React.useCallback((element: Element) => {
    if (element !== boardScroller.current || !pointer.current) return true;
    // Ancestor lists and their measured rects update separately when the over node changes.
    // Gate horizontal scrolling against the board's live rect, never a column's stale rect.
    const rect = element.getBoundingClientRect();
    const edge = rect.width * BOARD_SCROLL_THRESHOLD.x;
    const { x, y } = pointer.current;
    return y >= rect.top && y <= rect.bottom && (x <= rect.left + edge || x >= rect.right - edge);
  }, []);
  const collisionDetection: CollisionDetection = (args) =>
    rectIntersection({
      ...args,
      // The inner ref scrolls; collision bounds remain the live outer column.
      droppableRects: new Map(
        args.droppableContainers.flatMap(({ id, node }) =>
          node.current ? [[id, outerColumnRect(node.current)]] : [],
        ),
      ),
    });
  function onDragStart(event: Pick<DragStartEvent, 'activatorEvent'>) {
    const activator = event.activatorEvent;
    pointer.current =
      'clientX' in activator && 'clientY' in activator
        ? { x: Number(activator.clientX), y: Number(activator.clientY) }
        : null;
    setDragging(true);
  }
  function onDragEnd() {
    setDragging(false);
  }
  return {
    boardScroller,
    autoScroll: { canScroll, threshold: BOARD_SCROLL_THRESHOLD },
    measuring: {
      droppable: {
        // The ref lives inside the column scroller so both scroll axes stay reachable.
        measure: outerColumnRect,
      },
    },
    collisionDetection,
    onDragStart,
    onDragEnd,
  };
}
