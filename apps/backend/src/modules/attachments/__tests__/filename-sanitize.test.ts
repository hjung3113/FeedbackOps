// PLAN-22 C3a — unit coverage for the filename sanitizer.

import { describe, expect, it } from 'vitest';

import { FilenameSanitizeError, sanitizeFilename } from '../filename-sanitize.js';

describe('sanitizeFilename', () => {
  it('passes a plain ASCII filename through', () => {
    expect(sanitizeFilename('photo.png')).toBe('photo.png');
  });

  it('preserves Korean characters', () => {
    expect(sanitizeFilename('한국어 파일.pdf')).toBe('한국어 파일.pdf');
  });

  it('strips forward slashes (traversal)', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('....etcpasswd');
  });

  it('strips backslashes (Windows traversal)', () => {
    expect(sanitizeFilename('..\\..\\Windows\\system32\\evil.exe')).toBe(
      '....Windowssystem32evil.exe',
    );
  });

  it('strips NUL bytes', () => {
    const nul = String.fromCharCode(0);
    expect(sanitizeFilename(`photo${nul}.png`)).toBe('photo.png');
  });

  it('strips control characters (0x01, 0x1F, 0x7F)', () => {
    const ctrl =
      String.fromCharCode(0x01) +
      String.fromCharCode(0x1f) +
      String.fromCharCode(0x7f);
    expect(sanitizeFilename(`a${ctrl}b.txt`)).toBe('ab.txt');
  });

  it('throws when input is empty', () => {
    expect(() => sanitizeFilename('')).toThrow(FilenameSanitizeError);
  });

  it('throws when input is only slashes', () => {
    try {
      sanitizeFilename('///\\\\');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FilenameSanitizeError);
      expect((e as FilenameSanitizeError).reason).toBe('empty_after_sanitize');
    }
  });

  it('throws when input is only control chars', () => {
    const ctrl = String.fromCharCode(0x01) + String.fromCharCode(0x02);
    expect(() => sanitizeFilename(ctrl)).toThrow(FilenameSanitizeError);
  });

  it('clamps to 255 bytes', () => {
    const long = 'a'.repeat(300);
    const out = sanitizeFilename(long);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(255);
    expect(out.length).toBe(255);
  });

  it('clamps byte length safely across multi-byte codepoints', () => {
    // Korean codepoint = 3 bytes UTF-8; 100 chars = 300 bytes.
    const long = '가'.repeat(100);
    const out = sanitizeFilename(long);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(255);
    // Result should still be valid UTF-8 (no partial codepoints).
    expect(Buffer.from(out, 'utf8').toString('utf8')).toBe(out);
  });
});
