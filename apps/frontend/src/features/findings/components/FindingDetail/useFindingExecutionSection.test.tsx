import type { FindingDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useFindingExecutionSection } from './FindingExecutionSection';

vi.mock('@/lib/api/entity-links', () => ({
  fetchEntityLinksBySource: vi.fn(async () => ({ items: [] })),
}));

const FINDING = { id: 'finding-1' } as FindingDto;

function renderExecutionSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useFindingExecutionSection(FINDING), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('useFindingExecutionSection', () => {
  it('toggles the Request Task draft open and closed', () => {
    const { result } = renderExecutionSection();
    expect(result.current.requestTaskOpen).toBe(false);
    act(() => {
      result.current.setRequestTaskOpen(true);
    });
    expect(result.current.requestTaskOpen).toBe(true);
    act(() => {
      result.current.setRequestTaskOpen(false);
    });
    expect(result.current.requestTaskOpen).toBe(false);
  });
});
