// useCloseFocusReturn registry hygiene (#1032): rowRef(id) drops the element on
// detach. focusSelectedRow guards with isConnected, so a stale registry entry
// would be behaviorally invisible — a plain focus assertion cannot catch one.
// The assertion therefore observes the lookup itself: after detach, returnFocus
// must never consult the detached row element again.
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useCloseFocusReturn } from './useCloseFocusReturn';

it('drops a detached row from the registry: returnFocus never consults it', () => {
  const { result } = renderHook(() => useCloseFocusReturn('ctx'));
  const node = document.createElement('button');
  document.body.appendChild(node);
  const consulted: string[] = [];
  const tracked = new Proxy(node, {
    get(target: HTMLElement, property: string | symbol, receiver: unknown) {
      consulted.push(String(property));
      return Reflect.get(target, property, receiver);
    },
  });

  const attach = result.current.rowRef('r1');
  attach(tracked); // mount
  document.body.removeChild(node); // unmount: React removes the node, then detaches the ref
  attach(null);
  act(() => result.current.returnFocus('r1'));

  expect(consulted).toEqual([]);
});
