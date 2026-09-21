// useSurveys.test.ts — #398: survey list/detail payloads are validated at the
// network seam through the shared DTO schemas. The valid twins run before the
// malformed cases so the error assertions cannot pass vacuously.

import { ApiParseError } from '@/lib/api/types';
import type { Survey } from '../../types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSurvey, useSurveys } from '../useSurveys';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

type MockFetchArgs = {
  status: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
};

function mockFetch(response: MockFetchArgs): typeof fetch {
  const headers = new Headers(response.headers);
  return vi.fn(async () =>
    ({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers,
      text: async () =>
        response.jsonBody !== undefined ? JSON.stringify(response.jsonBody) : '',
    } as Response),
  ) as unknown as typeof fetch;
}

const SURVEY: Survey = {
  id: 'a1b2c3d4-0000-4111-8222-333344445555',
  workspace_id: '9a1b2c3d-0000-4111-8222-333344445555',
  display_id: 'SUR-12',
  type: 'discovery',
  status: 'open',
  title: '온보딩 탐구 설문',
  description: null,
  primary_managed_system_id: '3a1b2c3d-0000-4111-8222-333344445555',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: '4a1b2c3d-0000-4111-8222-333344445555',
  opened_at: '2026-07-01T00:00:00.000Z',
  closed_at: null,
  created_at: '2026-06-30T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
  questions: [
    {
      id: '6f1c2b3a-1111-4222-8333-444455556666',
      survey_id: 'a1b2c3d4-0000-4111-8222-333344445555',
      kind: 'single_choice',
      prompt: '가장 불편한 점은?',
      is_required: true,
      options: [
        { key: 'slow', label: '느림' },
        { key: 'complex', label: '복잡함' },
      ],
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      sort_order: 0,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
  ],
};

function renderHookWithClient<T>(callback: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(callback, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('useSurveys (list)', () => {
  it('resolves a valid array body to the parsed surveys (positive twin)', async () => {
    global.fetch = mockFetch({ status: 200, jsonBody: [SURVEY] });
    const { result } = renderHookWithClient(() => useSurveys());
    await waitFor(() => expect(result.current.data).toEqual([SURVEY]), { timeout: 5000 });
    expect(result.current.isError).toBe(false);
  });

  it('rejects a malformed list body with ApiParseError', async () => {
    global.fetch = mockFetch({ status: 200, jsonBody: [{ ...SURVEY, type: 'bogus' }] });
    const { result } = renderHookWithClient(() => useSurveys());

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(ApiParseError);
  });
});

describe('useSurvey (detail)', () => {
  it('resolves a valid detail body including questions (positive twin)', async () => {
    global.fetch = mockFetch({ status: 200, jsonBody: SURVEY });
    const { result } = renderHookWithClient(() => useSurvey(SURVEY.id));
    await waitFor(() => expect(result.current.data).toEqual(SURVEY), { timeout: 5000 });
    expect(result.current.data?.questions).toHaveLength(1);
  });

  it('rejects a detail body with a malformed question field via ApiParseError', async () => {
    global.fetch = mockFetch({
      status: 200,
      jsonBody: { ...SURVEY, questions: [{ ...SURVEY.questions?.[0], sort_order: 'first' }] },
    });
    const { result } = renderHookWithClient(() => useSurvey(SURVEY.id));

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.error).toBeInstanceOf(ApiParseError);
  });
});
