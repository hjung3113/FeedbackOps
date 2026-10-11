import {
  type CollisionDetection,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
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
  const coordinateGetter: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
    if (event.code !== 'ArrowRight' && event.code !== 'ArrowLeft') return undefined;
    const activeRect = context.collisionRect;
    if (!activeRect) return undefined;
    const columns = context.droppableContainers
      .getEnabled()
      .flatMap(({ node }) => (node.current ? [outerColumnRect(node.current)] : []))
      .filter((rect) => rect.width > 0)
      .sort((a, b) => a.left - b.left);
    if (!columns.length) return undefined;
    const centre = activeRect.left + activeRect.width / 2;
    let current = columns.findIndex((rect) => centre >= rect.left && centre <= rect.right);
    const outsideColumns = current === -1;
    if (outsideColumns) {
      const distance = (rect: (typeof columns)[number]) =>
        Math.min(Math.abs(centre - rect.left), Math.abs(centre - rect.right));
      let nearestDistance = Number.POSITIVE_INFINITY;
      columns.forEach((rect, index) => {
        if (distance(rect) < nearestDistance) {
          current = index;
          nearestDistance = distance(rect);
        }
      });
    }
    const target =
      columns[outsideColumns ? current : current + (event.code === 'ArrowRight' ? 1 : -1)];
    if (!target) return undefined;
    // KeyboardSensor coordinates are the active rect's top-left, not its centre.
    return { x: target.left + target.width / 2 - activeRect.width / 2, y: currentCoordinates.y };
  };
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
    coordinateGetter,
    onDragStart,
    onDragEnd,
  };
}
