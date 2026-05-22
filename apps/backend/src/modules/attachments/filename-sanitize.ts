// PLAN-22 D-05 — filename sanitizer.
//
// Strips path separators (`/`, `\`) and control characters (0x00-0x1F, 0x7F)
// from a client-supplied filename, then clamps to 255 bytes. Throws
// `FilenameSanitizeError` when the result is empty (e.g. input was only
// separators, or only control bytes). The route layer translates the throw
// to `validation.failed` with `path: ['filename']`.
//
// What this is NOT:
//   * Not a Unicode normalizer. Mojibake survives — by design, since the
//     client display name is the source of truth for the reporter UI.
//   * Not a content-type sniffer. The MIME allowlist is enforced separately.
//   * Not a uniqueness guarantor. The storage key includes a UUID prefix.

export class FilenameSanitizeError extends Error {
  override readonly name = 'FilenameSanitizeError';
  readonly reason: 'empty_input' | 'empty_after_sanitize';
  constructor(reason: 'empty_input' | 'empty_after_sanitize', message: string) {
    super(message);
    this.reason = reason;
  }
}

const MAX_BYTES = 255;

/**
 * Sanitize a client-supplied filename. Removes `/`, `\`, NUL, and other
 * control characters in the ranges 0x00-0x1F and 0x7F. Clamps the byte
 * length (UTF-8) to 255. Throws when the result is empty.
 */
export function sanitizeFilename(raw: string): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new FilenameSanitizeError('empty_input', 'filename must be a non-empty string');
  }

  // Remove path separators + control chars in one pass.
  let cleaned = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '/' || ch === '\\') continue;
    if (code <= 0x1f) continue; // NUL through US (covers 0x00).
    if (code === 0x7f) continue; // DEL.
    cleaned += ch;
  }

  cleaned = cleaned.trim();

  if (cleaned.length === 0) {
    throw new FilenameSanitizeError(
      'empty_after_sanitize',
      'filename is empty after stripping disallowed characters',
    );
  }

  // Clamp to 255 bytes (UTF-8). Slice on byte boundary; if the cut lands
  // mid-codepoint we drop the partial trailing byte(s).
  const bytes = Buffer.from(cleaned, 'utf8');
  if (bytes.byteLength <= MAX_BYTES) return cleaned;

  let cut = MAX_BYTES;
  // Walk backwards until we land on a non-continuation byte (top 2 bits != 10).
  while (cut > 0 && ((bytes[cut] ?? 0) & 0xc0) === 0x80) cut -= 1;
  const truncated = bytes.subarray(0, cut).toString('utf8');
  if (truncated.length === 0) {
    throw new FilenameSanitizeError(
      'empty_after_sanitize',
      'filename is empty after byte-length clamp',
    );
  }
  return truncated;
}
