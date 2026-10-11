import { useNavigate } from '@tanstack/react-router';
import { Command, useCommandState } from 'cmdk';
import { FileText, Loader2, Search } from 'lucide-react';
import * as React from 'react';

import { mapUnknownError } from '@/lib/api/errorMapper';
import { fetchNavResolve } from '@/lib/api/nav';
import { ApiError } from '@/lib/api/types';
import { COMMAND_PALETTE_COPY, normalizeDisplayId } from '@/lib/copy/command-palette';
import { DIALOG_CONTENT_MOTION, KeyboardShortcut, SCRIM_MOTION, cn } from '@fops/ui';
import { useCommandPalette } from './CommandPaletteContext';
import {
  type PaletteCommandDescriptor,
  type PaletteNavTree,
  buildPaletteCommands,
} from './commands';
import { shortcutLabel } from './platform';
import { useCommandPaletteShortcut } from './useCommandPaletteShortcut';

// #611 command palette — spec: docs/design-prototype/cmdk.jsx (panel, input row,
// grouped small-cap rows, empty state, footer) rendered through cmdk's Radix
// Dialog (Command.Dialog), platform-aware shortcut (issue #611 owner decision).
// Chrome is Korean per ADR-0057 A2; nav labels come from RAIL_ITEMS / NAV_TREE.
export interface CommandPaletteProps {
  navTree: PaletteNavTree;
  canAccessWorkspaceAdmin: boolean;
}

const ITEM_CLASS =
  // oxlint-disable-next-line shadcn/no-arbitrary-values -- command palette labels keep the 13.5px size of the prototype .cmdk-item-label (styles.css:950)
  'group grid w-full cursor-pointer grid-cols-[22px_56px_1fr_auto] items-center gap-2.5 rounded-md px-2.5 py-1.75 text-left text-[13.5px] text-text-primary outline-hidden aria-disabled:cursor-default aria-disabled:opacity-50 data-[selected=true]:bg-surface-row-selected data-[selected=true]:ring-inset data-[selected=true]:ring-1 data-[selected=true]:ring-accent-primary/28';

export function CommandPalette({ navTree, canAccessWorkspaceAdmin }: CommandPaletteProps) {
  const { open, setOpen, toggle } = useCommandPalette();
  const navigate = useNavigate();
  const [query, setQuery] = React.useState('');
  const [resolvingDisplayId, setResolvingDisplayId] = React.useState<string | null>(null);
  const [resolveError, setResolveError] = React.useState<string | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const resolveSessionRef = React.useRef(0);
  const resolveRequestIdRef = React.useRef(0);
  const resolveRequestRef = React.useRef<{
    id: number;
    session: number;
    controller: AbortController;
  } | null>(null);

  useCommandPaletteShortcut(toggle);

  const commands = React.useMemo(
    () => buildPaletteCommands({ navTree, canAccessWorkspaceAdmin }),
    [navTree, canAccessWorkspaceAdmin],
  );

  // Reset the query per open (prototype: query + active index reset), capture
  // the opener for focus return — Radix has no DialogTrigger here, so its
  // built-in close-focus restore is a no-op and we own it (#611 acceptance).
  React.useLayoutEffect(() => {
    if (!open) return;
    const session = ++resolveSessionRef.current;
    return () => {
      if (resolveSessionRef.current === session) resolveSessionRef.current += 1;
      const activeRequest = resolveRequestRef.current;
      if (activeRequest?.session === session) {
        resolveRequestRef.current = null;
        activeRequest.controller.abort();
      }
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setQuery('');
    setResolveError(null);
    setResolvingDisplayId(null);
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [open]);

  const displayId = normalizeDisplayId(query);

  const navigateToHref = React.useCallback(
    (href: string) => {
      const [path = '', search = ''] = href.split('?');
      const params = Object.fromEntries(new URLSearchParams(search));
      void navigate({ to: path, search: params } as never);
      setOpen(false);
    },
    [navigate, setOpen],
  );

  const openRecord = React.useCallback(
    async (normalizedId: string) => {
      const session = resolveSessionRef.current;
      const requestId = ++resolveRequestIdRef.current;
      const controller = new AbortController();
      resolveRequestRef.current?.controller.abort();
      resolveRequestRef.current = { id: requestId, session, controller };
      const isCurrentRequest = () =>
        resolveSessionRef.current === session && resolveRequestRef.current?.id === requestId;

      setResolveError(null);
      setResolvingDisplayId(normalizedId);
      try {
        const resolved = await fetchNavResolve(normalizedId, { signal: controller.signal });
        if (!isCurrentRequest()) return;
        const { route, search } = resolved.route_intent;
        await navigate({ to: route, search } as never);
        if (!isCurrentRequest()) return;
        setOpen(false);
      } catch (error) {
        if (!isCurrentRequest()) return;
        // navigation.md: missing / foreign-workspace / not-readable are the same
        // 404 not_found.record — one inline message, palette stays open.
        setResolveError(
          error instanceof ApiError && error.code === 'not_found.record'
            ? COMMAND_PALETTE_COPY.notFound
            : mapUnknownError(error).message,
        );
      } finally {
        if (isCurrentRequest()) {
          resolveRequestRef.current = null;
          setResolvingDisplayId(null);
        }
      }
    },
    [navigate, setOpen],
  );

  const busy = resolvingDisplayId !== null;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      loop
      label={COMMAND_PALETTE_COPY.accessibleName}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      overlayClassName={cn(
        'fixed inset-0 z-60 bg-accent-primary/16 backdrop-blur-xs',
        SCRIM_MOTION,
      )}
      contentClassName={cn(
        // oxlint-disable-next-line shadcn/no-arbitrary-values -- the palette panel keeps the 10px radius of the prototype .cmdk-panel (styles.css:865)
        'fixed left-1/2 top-[14vh] z-60 flex max-h-[72vh] w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-[10px] border border-border-subtle bg-surface-popover shadow-xl',
        DIALOG_CONTENT_MOTION,
      )}
      data-testid="command-palette-dialog"
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border-subtle px-4 py-3.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
        <Command.Input
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setResolveError(null);
          }}
          placeholder={COMMAND_PALETTE_COPY.placeholder}
          className="h-6 flex-1 bg-transparent text-md text-text-primary outline-hidden placeholder:text-text-muted"
        />
        <KeyboardShortcut>{COMMAND_PALETTE_COPY.escHint}</KeyboardShortcut>
      </div>

      <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 pb-2">
        <Command.Empty
          data-testid="command-palette-empty"
          className="flex flex-col items-center gap-2 p-8 text-center text-text-muted"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          <span>{COMMAND_PALETTE_COPY.empty}</span>
        </Command.Empty>

        {displayId !== undefined && (
          <CommandGroup heading={COMMAND_PALETTE_COPY.groups.open}>
            <Command.Item
              value={`${COMMAND_PALETTE_COPY.verbs.open} ${displayId}`}
              disabled={busy}
              onSelect={() => {
                void openRecord(displayId);
              }}
              className={ITEM_CLASS}
              data-testid="command-palette-open-record"
            >
              <CommandPaletteItemIcon>
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <FileText className="h-3 w-3" aria-hidden />
                )}
              </CommandPaletteItemIcon>
              <span className="text-tiny font-semibold uppercase tracking-kicker text-text-muted">
                {COMMAND_PALETTE_COPY.verbs.open}
              </span>
              <span className="truncate">{`${displayId} ${COMMAND_PALETTE_COPY.verbs.open}`}</span>
            </Command.Item>
          </CommandGroup>
        )}

        <CommandGroup heading={COMMAND_PALETTE_COPY.groups.navigate}>
          {commands
            .filter((command) => command.group === 'navigate')
            .map((command) => (
              <PaletteCommandRow
                key={command.id}
                command={command}
                disabled={busy}
                onSelect={navigateToHref}
              />
            ))}
        </CommandGroup>

        <CommandGroup heading={COMMAND_PALETTE_COPY.groups.create}>
          {commands
            .filter((command) => command.group === 'create')
            .map((command) => (
              <PaletteCommandRow
                key={command.id}
                command={command}
                disabled={busy}
                onSelect={navigateToHref}
              />
            ))}
        </CommandGroup>
      </Command.List>

      {resolveError !== null && (
        <p
          role="alert"
          data-testid="command-palette-error"
          className="shrink-0 border-t border-border-subtle px-4 py-2 text-xs text-accent-danger"
        >
          {resolveError}
        </p>
      )}

      <div className="flex shrink-0 items-center gap-3 border-t border-border-subtle bg-surface-canvas px-3.5 py-2">
        <span className="flex items-center gap-1">
          <KeyboardShortcut>↑</KeyboardShortcut>
          <KeyboardShortcut>↓</KeyboardShortcut>
          <span className="text-xs text-text-muted">
            {COMMAND_PALETTE_COPY.footer.navigateHint}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <KeyboardShortcut>↵</KeyboardShortcut>
          <span className="text-xs text-text-muted">{COMMAND_PALETTE_COPY.footer.runHint}</span>
        </span>
        <span className="flex items-center gap-1">
          <KeyboardShortcut>esc</KeyboardShortcut>
          <span className="text-xs text-text-muted">{COMMAND_PALETTE_COPY.footer.closeHint}</span>
        </span>
        {/* #611 owner decision: the shortcut hint in the palette footer uses the
            platform-appropriate label (⌘K on macOS, Ctrl K elsewhere). */}
        <span className="flex items-center gap-1">
          <KeyboardShortcut testId="command-palette-shortcut-hint">
            {shortcutLabel()}
          </KeyboardShortcut>
          <span className="text-xs text-text-muted">{COMMAND_PALETTE_COPY.rowLabel}</span>
        </span>
        <div className="flex-1" />
        <PaletteCommandCount />
      </div>
    </Command.Dialog>
  );
}

function PaletteCommandRow({
  command,
  disabled,
  onSelect,
}: {
  command: PaletteCommandDescriptor;
  disabled: boolean;
  onSelect: (href: string) => void;
}) {
  return (
    <Command.Item
      value={`${command.verb} ${command.label}`}
      disabled={disabled}
      onSelect={() => onSelect(command.href)}
      className={ITEM_CLASS}
      data-testid={`command-palette-item-${command.id}`}
    >
      <CommandPaletteItemIcon>{command.icon}</CommandPaletteItemIcon>
      <span className="text-tiny font-semibold uppercase tracking-kicker text-text-muted">
        {command.verb}
      </span>
      <span className="truncate">{command.label}</span>
    </Command.Item>
  );
}

function CommandPaletteItemIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-5.5 items-center justify-center rounded-icon-chip bg-surface-card text-text-secondary group-data-[selected=true]:text-accent-primary">
      {children}
    </span>
  );
}

function CommandGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group heading={heading} className="mt-1 first:mt-0">
      {children}
    </Command.Group>
  );
}

/** Visible-item count for `{count}개 명령` (prototype footer). Must run inside Command. */
function PaletteCommandCount() {
  const count = useCommandState((state) => state.filtered.count);
  return (
    <span className="text-xs text-text-muted" data-testid="command-palette-count">
      {count}
      {COMMAND_PALETTE_COPY.footer.commandCountSuffix}
    </span>
  );
}
