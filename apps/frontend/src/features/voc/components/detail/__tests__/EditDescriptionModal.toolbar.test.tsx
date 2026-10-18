// EditDescriptionModal — real RichEditor toolbar. The inline attach button is hidden here:
// attachments go through the dropzone (`attachment_ids[]`), and an inline pick would be dropped.

import { vocDescriptionToolbar } from '@/features/voc/components/create/VocDescriptionToolbar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/voc/hooks/useVocEditDescriptionMutation', () => ({
  useVocEditDescriptionMutation: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
}));

import { RichEditor } from '@fops/ui';
import { EditDescriptionModal } from '../EditDescriptionModal';

const VOC = {
  id: 'voc-uuid-1111',
  title: '기존 제목',
  updated_at: '2026-05-01T00:00:00Z',
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '기존 내용' }] }],
  },
};

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('edit-description toolbar', () => {
  it('offers no inline attach button, only the dropzone', async () => {
    renderWithClient(<EditDescriptionModal voc={VOC as never} open onClose={() => {}} />);
    await screen.findByRole('button', { name: '굵게' });
    expect(screen.queryByRole('button', { name: '첨부 파일 추가' })).toBeNull();
    expect(
      screen.getByRole('button', { name: /파일을 드래그하거나 클릭해서 추가/ }),
    ).toBeInTheDocument();
  });

  it('the default vocDescriptionToolbar() still offers the attach button', async () => {
    renderWithClient(
      <RichEditor
        surface="voc-description"
        value={null}
        onChange={() => {}}
        toolbar={vocDescriptionToolbar()}
      />,
    );
    expect(await screen.findByRole('button', { name: '첨부 파일 추가' })).toBeInTheDocument();
  });
});
