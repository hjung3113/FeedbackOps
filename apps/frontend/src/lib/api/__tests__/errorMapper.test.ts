import { describe, it, expect } from 'vitest';
import { ERROR_CODES, type ErrorCode } from '@fops/shared';
import { errorMapper, GENERIC_ERROR_MESSAGE } from '../errorMapper';

const VALID_TONES = new Set(['error', 'warning', 'info']);

const SLICE_3_OWNER_PREFIXES: ReadonlyArray<string> = [
  'voc.',
  'rich_content.',
  'attachment.',
  'reporter_facing_status.',
];
const SLICE_3_OWNER_CODES_EXACT: ReadonlyArray<ErrorCode> = [
  'conflict.stale_write',
  'conflict.triage_already_committed',
  'conflict.idempotency_key_reuse',
];

function isSlice3OwnerCode(code: ErrorCode): boolean {
  return (
    SLICE_3_OWNER_PREFIXES.some((p) => code.startsWith(p)) ||
    SLICE_3_OWNER_CODES_EXACT.includes(code)
  );
}

describe('errorMapper — ERROR_CODES coverage', () => {
  it('every ERROR_CODES code maps to a non-empty Korean message', () => {
    for (const code of ERROR_CODES) {
      const mapped = errorMapper({ code, message: '' });
      expect(mapped.message, `code ${code}`).toBeTruthy();
      expect(mapped.message.length, `code ${code}`).toBeGreaterThan(0);
    }
  });

  it('every code has tone in {error, warning, info}', () => {
    for (const code of ERROR_CODES) {
      const mapped = errorMapper({ code, message: '' });
      expect(VALID_TONES.has(mapped.tone), `code ${code} tone=${mapped.tone}`).toBe(true);
    }
  });

  it('Slice 3 owner codes have non-fallback Korean copy', () => {
    for (const code of ERROR_CODES) {
      if (!isSlice3OwnerCode(code)) continue;
      const mapped = errorMapper({ code, message: '' });
      expect(
        mapped.message,
        `Slice 3 owner code ${code} must not fall back to generic`,
      ).not.toBe(GENERIC_ERROR_MESSAGE);
    }
  });

  it('conflict.stale_write maps to warning + retry action when onRetry provided', () => {
    let called = false;
    const mapped = errorMapper(
      { code: 'conflict.stale_write', message: '' },
      { onRetry: () => { called = true; } },
    );
    expect(mapped.tone).toBe('warning');
    expect(mapped.action).toBeDefined();
    expect(mapped.action?.label).toBeTruthy();
    mapped.action?.run();
    expect(called).toBe(true);
  });

  it('rate_limited.actor renders retry_after_seconds inline (<60s → 초)', () => {
    const mapped = errorMapper({
      code: 'rate_limited.actor',
      message: 'rate limit exceeded',
      detail: { retry_after_seconds: 30 },
    });
    expect(mapped.tone).toBe('warning');
    expect(mapped.message).toContain('30초');
  });

  it('rate_limited.ip renders retry_after_seconds inline (≥60s → 분, ceil)', () => {
    const mapped = errorMapper({
      code: 'rate_limited.ip',
      message: 'rate limit exceeded',
      detail: { retry_after_seconds: 75 },
    });
    expect(mapped.message).toContain('2분');
  });

  it('rate_limited.actor falls back to generic wait copy without detail', () => {
    const mapped = errorMapper({ code: 'rate_limited.actor', message: '' });
    expect(mapped.message).toBe('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  });

  it('unknown code falls back to generic error', () => {
    const mapped = errorMapper({ code: 'made.up.code' as ErrorCode, message: '' });
    expect(mapped.message).toBe(GENERIC_ERROR_MESSAGE);
    expect(mapped.tone).toBe('error');
  });
});
