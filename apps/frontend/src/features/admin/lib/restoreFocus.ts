import { useEffect, useState } from 'react';

/** Heading that takes focus when the row that opened a dialog is gone (e.g. after archive). */
export const ADMIN_LIST_FOCUS_FALLBACK_ID = 'admin-list-focus-fallback';

/**
 * Returns focus to the row control that opened a dialog; when that row was removed,
 * falls back to the list heading so keyboard users keep their place.
 */
export function restoreFocus(trigger: HTMLElement | null): void {
  if (trigger?.isConnected) trigger.focus();
  else document.getElementById(ADMIN_LIST_FOCUS_FALLBACK_ID)?.focus();
}

/**
 * Arms the heading fallback for a dialog that just saved. The check runs once the list is no
 * longer fetching, i.e. in the commit that renders the refetched rows, so a row removed by the
 * save (archive) is already gone from the DOM when `trigger.isConnected` is read.
 */
export function useRestoreFocusAfterRefetch(
  fetching: boolean,
): (trigger: HTMLElement | null) => void {
  const [armed, setArmed] = useState<{ trigger: HTMLElement | null } | null>(null);
  useEffect(() => {
    if (armed === null || fetching) return;
    if (!armed.trigger?.isConnected) restoreFocus(null);
    setArmed(null);
  }, [armed, fetching]);
  return (trigger) => setArmed({ trigger });
}
