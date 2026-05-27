// RFC 5987 Content-Disposition filename encoding — PLAN-22 C4a.
//
// HTTP header values are ISO-8859-1; Korean / emoji / quote-bearing filenames
// must travel as `filename*=UTF-8''<percent-encoded>` per RFC 5987 §3.2 with
// an ASCII fallback in the legacy `filename=` parameter.
//
// Allowed token chars (RFC 5987 attr-char): `A-Z a-z 0-9 ! # $ & + - . ^ _ ` | ~`.
// Everything else is percent-encoded as UTF-8 bytes.

const ATTR_CHAR = /^[A-Za-z0-9!#$&+\-.^_`|~]$/;

/**
 * Percent-encode a filename per RFC 5987 attr-char rules. UTF-8 bytes of any
 * disallowed code unit are emitted as upper-case %HH triplets.
 */
export function encodeRfc5987(filename: string): string {
  const bytes = Buffer.from(filename, 'utf8');
  let out = '';
  for (const b of bytes) {
    const ch = String.fromCharCode(b);
    if (b < 0x80 && ATTR_CHAR.test(ch)) {
      out += ch;
    } else {
      out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

/**
 * ASCII fallback for the legacy `filename=` parameter. Strips non-ASCII and
 * control / quote / backslash chars. Returns `file.bin` if the result is
 * empty after stripping.
 */
export function asciiFallback(filename: string): string {
  // Strip control chars (<0x20, 0x7f), double-quote, backslash, and anything
  // above 0x7e (non-ASCII). The remainder is safely embeddable inside a
  // quoted-string per RFC 6266.
  let out = '';
  for (let i = 0; i < filename.length; i++) {
    const code = filename.charCodeAt(i);
    if (code < 0x20 || code === 0x22 /* " */ || code === 0x5c /* \ */ || code > 0x7e) continue;
    out += filename[i];
  }
  // Trim — a string of only-spaces is not a useful filename.
  out = out.trim();
  return out.length > 0 ? out : 'file.bin';
}
