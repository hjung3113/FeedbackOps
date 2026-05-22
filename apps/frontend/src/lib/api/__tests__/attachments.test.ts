import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadAttachment } from '../attachments';
import { ApiError } from '../types';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const UUID = '00000000-0000-4000-8000-000000000001';
const UUID2 = '00000000-0000-4000-8000-000000000002';
const VALID_201 = {
  id: UUID,
  name: 'screenshot.png',
  size_bytes: 1024,
  mime_type: 'image/png',
  uploaded_by_actor_id: UUID2,
  created_at: '2026-05-22T10:00:00.000Z',
};

type MockArgs = {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
};

function mockFetch(response: MockArgs): typeof fetch {
  const headers = new Headers(response.headers);
  return vi.fn(async () =>
    ({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers,
      text: async () =>
        response.jsonBody !== undefined ? JSON.stringify(response.jsonBody) : '',
    } as Response),
  ) as unknown as typeof fetch;
}

function getCallArgs(fetchMock: typeof fetch): [string, RequestInit] {
  const calls = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls as [
    string,
    RequestInit,
  ][];
  const first = calls[0];
  if (!first) throw new Error('fetch was not called');
  return first;
}

function makeFile(name = 'screenshot.png', type = 'image/png'): File {
  return new File(['hello'], name, { type });
}

describe('uploadAttachment', () => {
  it('POSTs multipart with Idempotency-Key header (no Content-Type)', async () => {
    const fetchMock = mockFetch({ status: 201, jsonBody: VALID_201 });
    global.fetch = fetchMock;
    await uploadAttachment(makeFile(), { idempotencyKey: 'key-abc' });
    const [url, init] = getCallArgs(fetchMock);
    expect(url).toBe('/attachments');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('key-abc');
    // Browser sets multipart boundary — we must NOT set Content-Type ourselves.
    expect(headers['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    const fd = init.body as FormData;
    expect(fd.get('file')).toBeInstanceOf(File);
  });

  it('returns parsed AttachmentCreated on 201', async () => {
    global.fetch = mockFetch({ status: 201, jsonBody: VALID_201 });
    const result = await uploadAttachment(makeFile());
    expect(result.id).toBe(UUID);
    expect(result.name).toBe('screenshot.png');
    expect(result.size_bytes).toBe(1024);
    expect(result.uploaded_by_actor_id).toBe(UUID2);
  });

  it('maps 422 attachment.too_large to typed ApiError', async () => {
    global.fetch = mockFetch({
      ok: false,
      status: 422,
      jsonBody: { code: 'attachment.too_large', message: 'too big' },
    });
    await expect(uploadAttachment(makeFile())).rejects.toBeInstanceOf(ApiError);
    global.fetch = mockFetch({
      ok: false,
      status: 422,
      jsonBody: { code: 'attachment.too_large', message: 'too big' },
    });
    try {
      await uploadAttachment(makeFile());
    } catch (e) {
      expect((e as ApiError).code).toBe('attachment.too_large');
      expect((e as ApiError).status).toBe(422);
    }
  });

  it('maps 422 attachment.unsupported_type to typed ApiError', async () => {
    global.fetch = mockFetch({
      ok: false,
      status: 422,
      jsonBody: { code: 'attachment.unsupported_type', message: 'nope' },
    });
    try {
      await uploadAttachment(makeFile());
    } catch (e) {
      expect((e as ApiError).code).toBe('attachment.unsupported_type');
    }
  });

  it('maps 502 storage.unavailable to typed ApiError', async () => {
    global.fetch = mockFetch({
      ok: false,
      status: 502,
      jsonBody: { code: 'storage.unavailable', message: 'down' },
    });
    try {
      await uploadAttachment(makeFile());
    } catch (e) {
      expect((e as ApiError).code).toBe('storage.unavailable');
      expect((e as ApiError).status).toBe(502);
    }
  });

  it('maps 429 rate_limited.actor with retry-after', async () => {
    const reset = Math.floor(Date.now() / 1000) + 30;
    global.fetch = mockFetch({
      ok: false,
      status: 429,
      headers: {
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(reset),
        'retry-after': '30',
      },
      jsonBody: {
        code: 'rate_limited.actor',
        message: 'too many',
        detail: { retry_after_seconds: 30 },
      },
    });
    try {
      await uploadAttachment(makeFile());
    } catch (e) {
      const err = e as ApiError;
      expect(err.code).toBe('rate_limited.actor');
      expect(err.retryAfterSeconds).toBe(30);
    }
  });
});
