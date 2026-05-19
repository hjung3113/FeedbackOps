import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { RichEditor, RichContentRenderer, type TipTapDoc } from '@fops/ui';

const SURFACES = ['voc-description', 'reporter-reply', 'public-update', 'internal-comment'] as const;
type Surface = (typeof SURFACES)[number];

function DevRichEditorPage() {
  const [surface, setSurface] = useState<Surface>('voc-description');
  const [mode, setMode] = useState<'reporter_visible' | 'internal'>('internal');
  const [doc, setDoc] = useState<TipTapDoc>({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '여기에 입력하세요. ' },
          { type: 'mention', attrs: { actor_id: 'u1', label: 'alice' } },
        ],
      },
    ],
  });

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-text-primary">RichEditor demo (DEV only)</h1>
        <p className="text-sm text-text-muted">surface = opaque pass-through. Backend sanitizer authoritative.</p>
      </header>

      <div className="flex gap-3 flex-wrap">
        <label className="text-sm text-text-muted">
          Surface:
          <select
            className="ml-2 px-2 py-1 border border-border-subtle rounded"
            value={surface}
            onChange={(e) => setSurface(e.target.value as Surface)}
          >
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-text-muted">
          Renderer mode:
          <select
            className="ml-2 px-2 py-1 border border-border-subtle rounded"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'reporter_visible' | 'internal')}
          >
            <option value="internal">internal</option>
            <option value="reporter_visible">reporter_visible (strips mention)</option>
          </select>
        </label>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-text-secondary">Editor</h2>
        <RichEditor surface={surface} value={doc} onChange={setDoc} placeholder="..." minHeight={140} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-text-secondary">Renderer (mode = {mode})</h2>
        <div className="border border-border-subtle rounded-md p-3 bg-surface-canvas">
          <RichContentRenderer doc={doc} mode={mode} />
        </div>
      </section>

      <details className="border border-border-subtle rounded-md p-3">
        <summary className="cursor-pointer text-sm text-text-secondary">JSON</summary>
        <pre className="text-xs overflow-auto mt-2">{JSON.stringify(doc, null, 2)}</pre>
      </details>
    </div>
  );
}

export const Route = createFileRoute('/dev-rich-editor')({
  component: DevRichEditorPage,
});
