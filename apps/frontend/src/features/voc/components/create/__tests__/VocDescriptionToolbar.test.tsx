// C9a — Unit tests for VocDescriptionToolbar.
// The toolbar is a render-prop function (Editor | null) => ReactElement | null.
// Tests use a fake editor object — no real TipTap instance required.

import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VocDescriptionToolbar } from '../VocDescriptionToolbar';
import { VOC_DESCRIPTION_TOOLBAR } from '../rich-toolbar-voc-description';
import type { TipTapEditor as Editor } from '@fops/ui';

// ── Chainable editor mock ─────────────────────────────────────────────────────
//
// TipTap's editor.chain() returns a builder that is chainable.
// We model this with a Proxy that always returns itself, except for .run()
// which records the call chain and returns void.

interface ChainSpy {
  run: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  toggleBold: ReturnType<typeof vi.fn>;
}

function makeEditorMock(): { editor: Editor; chainSpy: ChainSpy } {
  const runFn = vi.fn();
  const toggleBoldFn = vi.fn();
  const focusFn = vi.fn();

  // Each method in the chain returns `chain` so calls can be chained
  const chain: Record<string, unknown> = {};
  // Methods we care to assert on
  chain['run'] = runFn;
  chain['focus'] = (..._args: unknown[]) => { focusFn(); return chain; };
  chain['toggleBold'] = (..._args: unknown[]) => { toggleBoldFn(); return chain; };
  // Catch-all: return `chain` for any other method (italic, underline, etc.)
  const chainProxy = new Proxy(chain, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      // Unknown chained method — return a function that returns the proxy
      return (..._args: unknown[]) => chainProxy;
    },
  });

  const editor = {
    isActive: vi.fn(() => false),
    getAttributes: vi.fn(() => ({})),
    chain: vi.fn(() => chainProxy),
  } as unknown as Editor;

  return {
    editor,
    chainSpy: { run: runFn, focus: focusFn, toggleBold: toggleBoldFn },
  };
}

describe('<VocDescriptionToolbar>', () => {
  it('renders 7 buttons matching VOC_DESCRIPTION_TOOLBAR', () => {
    const { editor } = makeEditorMock();
    const element = VocDescriptionToolbar(editor);
    expect(element).not.toBeNull();
    render(element!);

    // Each toolbar item has data-testid="voc-toolbar-<id>"
    for (const item of VOC_DESCRIPTION_TOOLBAR) {
      expect(screen.getByTestId(`voc-toolbar-${item.id}`)).toBeInTheDocument();
    }
    expect(VOC_DESCRIPTION_TOOLBAR).toHaveLength(7);
  });

  it('all buttons (including PLAN-22 C8 attach) are enabled', () => {
    const { editor } = makeEditorMock();
    const element = VocDescriptionToolbar(editor);
    render(element!);

    for (const item of VOC_DESCRIPTION_TOOLBAR) {
      const btn = screen.getByTestId(`voc-toolbar-${item.id}`);
      expect(btn).not.toBeDisabled();
    }
  });

  it('clicking bold invokes chain().focus().toggleBold().run() on the editor', () => {
    const { editor, chainSpy } = makeEditorMock();
    const element = VocDescriptionToolbar(editor);
    render(element!);

    fireEvent.click(screen.getByTestId('voc-toolbar-bold'));

    expect(editor.chain).toHaveBeenCalledOnce();
    expect(chainSpy.focus).toHaveBeenCalledOnce();
    expect(chainSpy.toggleBold).toHaveBeenCalledOnce();
    expect(chainSpy.run).toHaveBeenCalledOnce();
  });

  it('returns null when editor is null', () => {
    const result = VocDescriptionToolbar(null);
    expect(result).toBeNull();
  });
});
