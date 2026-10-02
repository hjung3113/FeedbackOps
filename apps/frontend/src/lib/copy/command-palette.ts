// #611 command palette copy. Prototype authority: docs/design-prototype/cmdk.jsx
// (placeholder, empty state, footer) rendered verbatim; chrome is Korean per
// ADR-0057 A2 (prototype's English command labels become the app's Korean nav
// labels — see CommandPalette command building).

export const COMMAND_PALETTE_COPY = {
  /** Accessible name of the dialog. */
  accessibleName: '명령 메뉴',
  /** Label of the Home sidebar Command row (prototype shell.jsx `key: 'cmd'`). */
  rowLabel: '명령 메뉴',
  placeholder: '명령 또는 항목 검색…  (예: New VOC, Tasks Board, Tableau)',
  escHint: 'ESC',
  groups: {
    navigate: '이동',
    create: '생성',
    open: '열기',
  },
  verbs: {
    navigate: '이동',
    create: '생성',
    open: '열기',
  },
  createVocLabel: 'VOC 생성',
  empty: '일치하는 명령이 없습니다.',
  footer: {
    navigateHint: '탐색',
    runHint: '실행',
    closeHint: '닫기',
    /** Rendered as `${count}개 명령` — Korean counter suffix has no space. */
    commandCountSuffix: '개 명령',
  },
  notFound: '해당 항목을 찾을 수 없거나 접근 권한이 없습니다.',
} as const;

/** Display ids the first version can open via GET /nav/resolve (docs/implementation/api/navigation.md). */
export const DISPLAY_ID_PATTERN = /^(VOC|FIN|REQ|TASK)-[1-9][0-9]*$/i;

/** `voc-12` → `VOC-12`; `undefined` when the query is not a display id. */
export function normalizeDisplayId(query: string): string | undefined {
  const trimmed = query.trim();
  if (!DISPLAY_ID_PATTERN.test(trimmed)) return undefined;
  return trimmed.toUpperCase();
}
