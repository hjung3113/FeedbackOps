// RFC 5987 encoder unit tests — PLAN-22 C4a.

import { describe, expect, it } from 'vitest';

import { asciiFallback, encodeRfc5987 } from '../rfc5987.js';

describe('encodeRfc5987', () => {
  it('passes ASCII attr-chars through unchanged', () => {
    expect(encodeRfc5987('photo.png')).toBe('photo.png');
    expect(encodeRfc5987('Report-2024_v1.pdf')).toBe('Report-2024_v1.pdf');
  });

  it('percent-encodes Korean as UTF-8 bytes', () => {
    // 한글.pdf
    //   한 = E1 95 9C → wait: 한 U+D55C → UTF-8 ED 95 9C
    //   글 = U+AE00 → UTF-8 EA B8 80
    //   .  = .
    //   pdf
    expect(encodeRfc5987('한글.pdf')).toBe('%ED%95%9C%EA%B8%80.pdf');
  });

  it('percent-encodes special chars (space, semicolon, quote)', () => {
    expect(encodeRfc5987('a b')).toBe('a%20b');
    expect(encodeRfc5987('a;b')).toBe('a%3Bb');
    expect(encodeRfc5987('a"b')).toBe('a%22b');
    expect(encodeRfc5987("a'b")).toBe('a%27b');
  });
});

describe('asciiFallback', () => {
  it('strips non-ASCII chars', () => {
    expect(asciiFallback('한글.pdf')).toBe('.pdf');
  });

  it('strips quotes, backslashes, and control chars', () => {
    expect(asciiFallback('a"b\\c\x01d')).toBe('abcd');
  });

  it('falls back to file.bin when result is empty', () => {
    expect(asciiFallback('한글')).toBe('file.bin');
    expect(asciiFallback('')).toBe('file.bin');
    expect(asciiFallback('   ')).toBe('file.bin');
  });

  it('preserves ASCII alphanumerics, dots, dashes', () => {
    expect(asciiFallback('My-File_2024.pdf')).toBe('My-File_2024.pdf');
  });
});
