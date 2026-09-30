import { DOCUMENT_TITLE_COPY, getDocumentScreenTitle } from '@/lib/copy/document-titles';
import { useRouterState } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';

interface RegisteredTitle {
  label: string;
  order: number;
}

const registeredTitles = new Map<symbol, RegisteredTitle>();
let nextTitleOrder = 0;
let currentScreenTitle: string | null = null;

export function formatDocumentTitle(label: string): string {
  return `${label} · ${DOCUMENT_TITLE_COPY.app}`;
}

export function formatRecordDocumentTitle(
  record: { displayId: string; title: string } | null,
): string | null {
  if (record === null || record.displayId.trim() === '' || record.title.trim() === '') {
    return null;
  }

  return `${record.displayId} · ${record.title}`;
}

function activeRegisteredTitle(): RegisteredTitle | null {
  let active: RegisteredTitle | null = null;
  for (const registered of registeredTitles.values()) {
    if (active === null || registered.order > active.order) active = registered;
  }
  return active;
}

function applyDocumentTitle(): void {
  if (typeof document === 'undefined') return;

  const label = activeRegisteredTitle()?.label ?? currentScreenTitle;
  document.title = label === null ? DOCUMENT_TITLE_COPY.app : formatDocumentTitle(label);
}

function setScreenTitle(label: string | null): void {
  currentScreenTitle = label;
  applyDocumentTitle();
}

function setRegisteredTitle(owner: symbol, label: string | null): void {
  if (label === null || label.trim() === '') {
    registeredTitles.delete(owner);
  } else {
    registeredTitles.set(owner, { label, order: ++nextTitleOrder });
  }
  applyDocumentTitle();
}

export function DocumentTitleProvider({ children }: { children: ReactNode }) {
  const location = useRouterState({ select: (state) => state.location });
  const screenTitle = getDocumentScreenTitle(location.pathname, location.search);

  useEffect(() => {
    setScreenTitle(screenTitle);
  }, [screenTitle]);

  useEffect(() => () => setScreenTitle(null), []);

  return children;
}

export function useDocumentTitle(title: string | null): void {
  const owner = useRef(Symbol('document-title'));

  useEffect(() => {
    setRegisteredTitle(owner.current, title);
  }, [title]);

  useEffect(() => () => setRegisteredTitle(owner.current, null), []);
}
