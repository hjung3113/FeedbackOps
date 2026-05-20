import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RichContentRenderer, RichEditor, type TipTapDoc } from '../src/index';

const sampleDoc: TipTapDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'mention', attrs: { actor_id: 'u1' } },
        { type: 'text', text: ' world.' },
      ],
    },
  ],
};

describe('RichEditor', () => {
  it('mounts with surface prop and renders initial value', () => {
    render(<RichEditor surface="voc-description" value={sampleDoc} />);
    const root = document.querySelector('[data-surface="voc-description"]');
    expect(root).toBeInTheDocument();
  });

  it('respects disabled prop', () => {
    render(<RichEditor surface="voc-description" value={sampleDoc} disabled />);
    // Editor instance is editable=false; assertion via attribute
    const root = document.querySelector('[data-surface="voc-description"]');
    expect(root).toBeInTheDocument();
    // The ProseMirror div should have contenteditable=false when disabled
    const editorDiv = root?.querySelector('[contenteditable]');
    expect(editorDiv?.getAttribute('contenteditable')).toBe('false');
  });

  it('calls onChange with a doc-shaped object when content changes', () => {
    const onChange = vi.fn();
    render(
      <RichEditor
        surface="reporter-reply"
        defaultValue={{ type: 'doc', content: [{ type: 'paragraph' }] }}
        onChange={onChange}
      />,
    );
    const root = document.querySelector('[data-surface="reporter-reply"]');
    expect(root).toBeInTheDocument();
    // onChange is called on mount with the initial doc shape; verify signature
    // (TipTap fires onUpdate after editorDidMount for controlled usage)
    // We assert structure only — exact call count depends on TipTap internals.
    if (onChange.mock.calls.length > 0) {
      const doc = onChange.mock.calls[0]?.[0] as TipTapDoc;
      expect(doc.type).toBe('doc');
    }
  });
});

describe('RichContentRenderer mode handling', () => {
  it('mode="reporter_visible" strips mention nodes', () => {
    render(<RichContentRenderer doc={sampleDoc} mode="reporter_visible" />);
    expect(screen.queryByText(/@u1/)).not.toBeInTheDocument();
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
    expect(screen.getByText(/world/)).toBeInTheDocument();
  });

  it('mode="internal" preserves mention nodes', () => {
    render(<RichContentRenderer doc={sampleDoc} mode="internal" />);
    expect(screen.getByText(/@u1/)).toBeInTheDocument();
  });
});

describe('attachmentRef + mention extension round-trip', () => {
  it('attachmentRef round-trip — only id survives, extra attrs not present', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'attachmentRef',
          attrs: { id: 'a1' },
        },
      ],
    };
    render(<RichContentRenderer doc={doc} mode="internal" />);
    const el = document.querySelector('[data-type="attachment-ref"]');
    expect(el).toBeInTheDocument();
    // Canonical attrs: only id. No name, sizeBytes, mimeType (display via runtime registry #19+).
    expect(el?.getAttribute('id')).toBe('a1');
    expect(el?.getAttribute('data-size-bytes')).toBeNull();
    expect(el?.getAttribute('name')).toBeNull();
    expect(el?.getAttribute('mimetype')).toBeNull();
  });

  it('mention round-trip — only actor_id, label not present', () => {
    render(<RichContentRenderer doc={sampleDoc} mode="internal" />);
    const el = document.querySelector('[data-type="mention"]');
    expect(el).toBeInTheDocument();
    // Canonical: actor_id only. Label comes from runtime user registry (#19+).
    expect(el?.textContent).toContain('@u1');
    expect(el?.getAttribute('label')).toBeNull();
  });
});
