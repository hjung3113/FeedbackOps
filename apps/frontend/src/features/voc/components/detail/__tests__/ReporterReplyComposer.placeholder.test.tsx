import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/voc/hooks/useVocReporterReplyMutation', () => ({
  useVocReporterReplyMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock('@fops/ui', async (importActual) => {
  const actual = await importActual<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({ placeholder }: { placeholder?: string }) =>
      React.createElement('div', { 'data-testid': 'rich-editor' }, placeholder),
  };
});

import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@fops/shared';
import { ReporterReplyComposer } from '../ReporterReplyComposer';

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const VOC = { id: 'voc-1', reporter_id: REPORTER_ID } as unknown as VocDetailEnvelope;

function me(id: string, role_level: 'user' | 'admin'): MeResponse {
  return {
    actor: {
      id,
      external_id: id,
      email: `${id}@feedbackops.local`,
      display_name: id,
      role_level,
    },
    workspace_id: 'ws-1',
  };
}

describe('ReporterReplyComposer placeholder', () => {
  it.each([
    ['reporter', me(REPORTER_ID, 'user'), '담당자에게 보낼 답장 내용을 입력하세요...'],
    ['operator', me(ADMIN_ID, 'admin'), '제출자에게 보낼 답장 내용을 입력하세요...'],
  ])('addresses the other party for the %s', (_who, viewer, expected) => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ReporterReplyComposer voc={VOC} me={viewer} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('rich-editor')).toHaveTextContent(expected);
  });
});
