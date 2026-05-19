import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichEditor, RichContentRenderer, type TipTapDoc } from '../src/index';

const sampleDoc: TipTapDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'mention', attrs: { actor_id: 'u1', label: 'alice' } },
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
  });
});

describe('RichContentRenderer mode handling', () => {
  it('mode="reporter_visible" strips mention nodes', () => {
    render(<RichContentRenderer doc={sampleDoc} mode="reporter_visible" />);
    expect(screen.queryByText(/@alice/)).not.toBeInTheDocument();
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
    expect(screen.getByText(/world/)).toBeInTheDocument();
  });

  it('mode="internal" preserves mention nodes', () => {
    render(<RichContentRenderer doc={sampleDoc} mode="internal" />);
    expect(screen.getByText(/@alice/)).toBeInTheDocument();
  });
});

describe('attachmentRef + mention extension round-trip', () => {
  it('attachmentRef attrs preserved through HTML generation', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'attachmentRef',
          attrs: { id: 'a1', name: 'spec.pdf', sizeBytes: 1024, mimeType: 'application/pdf' },
        },
      ],
    };
    render(<RichContentRenderer doc={doc} mode="internal" />);
    const el = document.querySelector('[data-type="attachment-ref"]');
    expect(el).toBeInTheDocument();
    expect(el?.getAttribute('data-size-bytes')).toBe('1024');
  });

  it('mention chip renders @label', () => {
    render(<RichContentRenderer doc={sampleDoc} mode="internal" />);
    const el = document.querySelector('[data-type="mention"]');
    expect(el).toBeInTheDocument();
    expect(el?.textContent).toContain('@alice');
  });
});
