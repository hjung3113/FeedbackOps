// MentionPickerButton — Combobox-backed @mention picker for InternalCommentComposer.
//
// C5.4 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.4
// Spec §3.5: Combobox click only — NOT inline @-autocomplete.
//
// Renders a small "@" trigger button. On click, opens a Combobox popover listing
// workspace actors from useWorkspaceActors. Selecting an actor calls onSelect with
// the actor, which the composer uses to insert a mention node into the editor.
//
// Does NOT directly manipulate the editor — editor insertion is owned by the composer
// so the picker can be tested without a live TipTap instance.

import { type WorkspaceActor, useWorkspaceActors } from '@/features/voc/hooks/useWorkspaceActors';
import { Popover, PopoverContent, PopoverTrigger } from '@fops/ui';
import { cn } from '@fops/ui';
import { AtSign } from 'lucide-react';
import * as React from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MentionPickerButtonProps {
  /**
   * Called when the user selects an actor from the combobox.
   * The composer is responsible for inserting the mention node into the editor.
   */
  onSelect: (actor: Pick<WorkspaceActor, 'id' | 'display_name'>) => void;
  disabled?: boolean;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MentionPickerButton({
  onSelect,
  disabled,
  className,
}: MentionPickerButtonProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const { actors = [] } = useWorkspaceActors();

  const filtered = React.useMemo(() => {
    if (!search) return actors;
    const lower = search.toLowerCase();
    return actors.filter((a) => a.display_name.toLowerCase().includes(lower));
  }, [actors, search]);

  function handleSelect(actor: WorkspaceActor) {
    onSelect({ id: actor.id, display_name: actor.display_name });
    setOpen(false);
    setSearch('');
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="@Mention"
          aria-haspopup="listbox"
          aria-expanded={open}
          onMouseDown={(e) => {
            // Prevent editor blur on toolbar click.
            e.preventDefault();
          }}
          onClick={() => {
            if (!disabled) setOpen((v) => !v);
          }}
          className={cn(
            'inline-flex items-center gap-1 h-7 px-2 rounded text-xs font-medium',
            'text-text-secondary border border-border-default bg-surface-canvas',
            'hover:bg-surface-row-hover hover:text-text-primary',
            'disabled:cursor-not-allowed disabled:opacity-40',
            className,
          )}
        >
          <AtSign size={12} aria-hidden="true" />
          <span>@</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Search input */}
        <div className="border-b border-border-subtle px-3 py-2">
          <input
            // biome-ignore lint/a11y/noAutofocus: WAI-ARIA APG §combobox — search input auto-focuses when popup opens so keyboard users can immediately filter
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="멤버 검색…"
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
            aria-label="멤버 검색"
          />
        </div>
        {/* Actor list */}
        {/* biome-ignore lint/a11y/useFocusableInteractive: WAI-ARIA APG §combobox — listbox focus managed via aria-activedescendant on the search input */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: <ul role="listbox"> is canonical ARIA listbox per APG §combobox */}
        {/* biome-ignore lint/a11y/useSemanticElements: WAI-ARIA APG §combobox requires <ul role="listbox"> as scrollable container */}
        <ul role="listbox" aria-label="워크스페이스 멤버" className="max-h-48 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted" role="presentation">
              결과 없음
            </li>
          ) : (
            filtered.map((actor) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: pointer selection; keyboard handled by search input
              <li
                key={actor.id}
                // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA APG §combobox requires <li role="option">; native <option> only works inside <select>
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: <li role="option"> is canonical ARIA listbox option per APG §combobox
                role="option"
                aria-selected={false}
                tabIndex={-1}
                className={cn(
                  'flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-sm text-text-primary',
                  'hover:bg-surface-row-hover',
                )}
                onClick={() => handleSelect(actor)}
              >
                <AtSign size={12} className="text-text-muted shrink-0" aria-hidden="true" />
                <span>{actor.display_name}</span>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
