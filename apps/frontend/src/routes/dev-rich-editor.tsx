import { RichContentRenderer, RichEditor, type RichEditorSurface, type TipTapDoc } from '@fops/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMapper } from '../lib/api/errorMapper';
import type { ApiErrorEnvelope } from '../lib/api/types';

const SURFACES: RichEditorSurface[] = [
  'voc-description',
  'reporter-reply',
  'public-update',
  'internal-comment',
];

/** Dev-only: fire a fake ApiErrorEnvelope through errorMapper → sonner toast. */
function triggerToast(envelope: ApiErrorEnvelope, onRetry?: () => void) {
  const mapped = errorMapper(envelope, onRetry ? { onRetry } : undefined);
  if (mapped.action) {
    toast.warning(mapped.message, {
      action: {
        label: mapped.action.label,
        onClick: mapped.action.run,
      },
    });
  } else if (mapped.tone === 'warning') {
    toast.warning(mapped.message);
  } else if (mapped.tone === 'info') {
    toast.info(mapped.message);
  } else {
    toast.error(mapped.message);
  }
}

function DevRichEditorPage() {
  const [surface, setSurface] = useState<RichEditorSurface>('voc-description');
  const [mode, setMode] = useState<'reporter_visible' | 'internal'>('internal');
  const [doc, setDoc] = useState<TipTapDoc>({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '여기에 입력하세요. ' },
          { type: 'mention', attrs: { actor_id: 'u1' } },
        ],
      },
    ],
  });

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-text-primary">RichEditor demo (DEV only)</h1>
        <p className="text-sm text-text-muted">
          surface = opaque pass-through. Backend sanitizer authoritative.
        </p>
      </header>

      <div className="flex gap-3 flex-wrap">
        <label className="text-sm text-text-muted">
          Surface:
          <select
            className="ml-2 px-2 py-1 border border-border-subtle rounded"
            value={surface}
            onChange={(e) => setSurface(e.target.value as RichEditorSurface)}
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
        <RichEditor
          surface={surface}
          value={doc}
          onChange={setDoc}
          placeholder="..."
          minHeight={140}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-text-secondary">Renderer (mode = {mode})</h2>
        <div className="border border-border-subtle rounded-md p-3 bg-surface-canvas">
          <RichContentRenderer doc={doc} mode={mode} />
        </div>
      </section>

      {/* DEV: Sanitizer-error → toast smoke test */}
      <section className="space-y-2 border border-dashed border-border-strong rounded-md p-3">
        <h2 className="text-sm font-medium text-text-secondary">
          Sanitizer error toast (dev smoke)
        </h2>
        <p className="text-xs text-text-muted">
          Simulates backend sanitizer rejection envelopes through errorMapper → sonner. Validates
          the editor → sanitizer → toast UX before real network calls land in #19.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded border border-border-subtle bg-surface-field hover:bg-surface-row-hover"
            onClick={() =>
              triggerToast({
                code: 'rich_content.disallowed_node',
                message: '',
              })
            }
          >
            Trigger rich_content.disallowed_node
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded border border-border-subtle bg-surface-field hover:bg-surface-row-hover"
            onClick={() =>
              triggerToast({ code: 'conflict.stale_write', message: '' }, () =>
                toast.info('최신 내용을 불러옵니다…'),
              )
            }
          >
            Trigger conflict.stale_write (with action)
          </button>
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
