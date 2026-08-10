import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({ useQuery: useQueryMock }));

vi.mock('@fops/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <>{children}</> : null,
  DialogContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  // Rendered as a span, not a label: this stub never wraps a control, and a
  // bare <label> trips biome's noLabelWithoutControl.
  FieldLabel: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <span {...props}>{children}</span>
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    register: () => ({}),
    handleSubmit: (submit: unknown) => submit,
    reset: vi.fn(),
    formState: { errors: {} },
  }),
}));
vi.mock('@hookform/resolvers/zod', () => ({ zodResolver: vi.fn() }));

describe('RequestTaskModal pending-source notice', () => {
  it('AC-E11a shows a pending source request but keeps the modal and submit control active', async () => {
    useQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            display_id: 'REQ-1000',
            source_type: 'voc_cluster',
            source_id: '22222222-2222-4222-8222-222222222222',
          },
        ],
      },
    });
    const { RequestTaskModal } = await import('../RequestTaskModal');

    render(
      <RequestTaskModal
        open
        evidenceSummaryDefault="근거"
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        source={{ type: 'voc_cluster', id: '22222222-2222-4222-8222-222222222222' }}
      />,
    );

    expect(screen.getByTestId('request-task-modal')).toBeInTheDocument();
    expect(screen.getByTestId('request-task-pending-notice')).toHaveTextContent('REQ-1000');
    expect(screen.getByRole('link', { name: 'REQ-1000' })).toHaveAttribute(
      'href',
      '/tasks?view=requests&param=11111111-1111-4111-8111-111111111111',
    );
    expect(screen.getByTestId('request-task-submit')).toBeEnabled();
  });

  it('AC-E11b renders the open modal before asserting no pending-request notice', async () => {
    useQueryMock.mockReturnValue({ data: { items: [] } });
    const { RequestTaskModal } = await import('../RequestTaskModal');

    render(
      <RequestTaskModal
        open
        evidenceSummaryDefault="근거"
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        source={{ type: 'voc_cluster', id: '22222222-2222-4222-8222-222222222222' }}
      />,
    );

    expect(screen.getByTestId('request-task-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('request-task-pending-notice')).not.toBeInTheDocument();
  });
});
