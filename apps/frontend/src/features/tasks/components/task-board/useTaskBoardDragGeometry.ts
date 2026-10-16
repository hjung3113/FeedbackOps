import {
  type Active,
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
  // One column per press (#1114): the current column is a tracked index, never re-derived from
  // the collision rect or `context.over`, which both lag the auto-scroll a press can trigger.
  // Refs are written only from the sensor getter and the drag handlers, never during render.
  const originStatus = React.useRef<string | null>(null);
  const columnIndex = React.useRef<number | null>(null);
  const coordinateGetter: KeyboardCoordinateGetter = (
    event,
    { active, context, currentCoordinates },
  ) => {
    if (event.code !== 'ArrowRight' && event.code !== 'ArrowLeft') return undefined;
    const activeRect = context.collisionRect;
    if (!activeRect) return undefined;
    const columns = context.droppableContainers
      .getEnabled()
      .flatMap(({ id, node }) =>
        node.current ? [{ id: String(id), rect: outerColumnRect(node.current) }] : [],
      )
      .filter(({ rect }) => rect.width > 0)
      .sort((a, b) => a.rect.left - b.rect.left);
    if (!columns.length) return undefined;
    if (columnIndex.current === null) {
      const origin =
        originStatus.current ??
        (context.draggableNodes.get(active)?.data.current?.task as { status?: string } | undefined)
          ?.status;
      const start = columns.findIndex(({ id }) => id === origin);
      if (start < 0) return undefined;
      columnIndex.current = start;
    }
    const next = Math.min(
      columns.length - 1,
      Math.max(0, columnIndex.current + (event.code === 'ArrowRight' ? 1 : -1)),
    );
    columnIndex.current = next;
    const target = columns[next]?.rect;
    if (!target) return undefined;
    // KeyboardSensor coordinates are the active rect's top-left, not its centre.
    return { x: target.left + target.width / 2 - activeRect.width / 2, y: currentCoordinates.y };
  };
  function resetColumnTracking() {
    originStatus.current = null;
    columnIndex.current = null;
  }
  function onDragStart(event: Pick<DragStartEvent, 'activatorEvent'> & { active?: Active }) {
    resetColumnTracking();
    originStatus.current =
      (event.active?.data.current?.task as { status?: string } | undefined)?.status ?? null;
    const activator = event.activatorEvent;
    pointer.current =
      'clientX' in activator && 'clientY' in activator
        ? { x: Number(activator.clientX), y: Number(activator.clientY) }
        : null;
    setDragging(true);
  }
  const onDragEnd = React.useCallback(() => {
    originStatus.current = null;
    columnIndex.current = null;
    setDragging(false);
  }, []);
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
    reset: onDragEnd,
  };
}
