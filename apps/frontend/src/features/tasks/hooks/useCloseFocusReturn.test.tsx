// A row whose ref was detached must stop being a live focus target — even after
// its original DOM node reconnects: auto-animate reinserts the removed node for
// the exit animation (`useListMotion`, exported by `@ap/ui`). returnFocus must
// then leave focus on the control the user is actually on.
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useCloseFocusReturn } from './useCloseFocusReturn';

it('keeps focus off a row whose ref was detached, even after its node reconnects', () => {
  const { result } = renderHook(() => useCloseFocusReturn('ctx'));
  const node = document.createElement('button');
  document.body.appendChild(node);
  const other = document.createElement('button');
  document.body.appendChild(other);

  const attach = result.current.rowRef('r1');
  attach(node); // mount
  document.body.removeChild(node); // unmount: React removes the node, then detaches the ref
  attach(null);
  document.body.appendChild(node); // exit animation: the removed node is reinserted
  act(() => {
    other.focus();
  });
  act(() => result.current.returnFocus('r1'));

  expect(document.activeElement).toBe(other);
});
