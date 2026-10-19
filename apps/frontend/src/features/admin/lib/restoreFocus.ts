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
