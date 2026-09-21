// PUBLIC_ATTACHMENT_ORIGIN validation (issue #402).
//
// The value is interpolated verbatim into the CSP (server.ts img-src and
// connect-src), so anything beyond a strict origin is a header-injection or
// breakage risk. Accepted values:
//   - the quoted literal 'self' (the default; everything same-origin), or
//   - a bare origin `https://host[:port]`, or
//   - outside production only: `http://localhost[:port]` / `http://127.0.0.1[:port]`.
//
// Everything else is rejected at config load: paths (including a bare
// trailing `/`), query, fragment, credentials, wildcards, whitespace and
// CSP separators (`;` `,`), other schemes, malformed strings.
//
// Returns null when the value is acceptable, otherwise a reason message.
// Messages never echo the input value (it may contain credentials).

export function validateAttachmentOrigin(value: string, nodeEnv: string): string | null {
  const PREFIX = 'PUBLIC_ATTACHMENT_ORIGIN';
  if (value === "'self'") return null;
  if (value.trim().length === 0) {
    return `${PREFIX} must not be empty; use 'self' (quoted) or an https:// origin like https://cdn.example.com`;
  }
  if (value.trim() !== value || /[\s;,]/.test(value)) {
    return `${PREFIX} must not contain whitespace, ';', or ',' (they can break the CSP header)`;
  }
  if (value === 'self') {
    return `${PREFIX} must be the quoted literal 'self' (with single quotes)`;
  }
  if (value.includes('*')) {
    return `${PREFIX} must not contain wildcards (*)`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `${PREFIX} must be 'self' (quoted) or an absolute origin like https://cdn.example.com`;
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return `${PREFIX} must not contain credentials (user:password@)`;
  }
  // Exact-origin equality rejects paths, query, fragment, a bare trailing
  // '/', and any parser normalization (uppercase host, IDN, empty port).
  if (url.origin !== value) {
    return `${PREFIX} must be a bare origin in canonical form (https://host[:port]: lowercase host, no default port, no path, query, fragment, or trailing slash)`;
  }
  // URL validity is not CSP host-source validity: reject IPv6 literals and
  // anything outside the letters-digits-hyphen DNS label grammar (IDN hosts
  // arrive already punycoded; underscores are not valid in CSP hosts).
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(url.hostname)) {
    return `${PREFIX} host must be a plain DNS name or IPv4 address usable in a CSP host-source`;
  }
  const isLocalHttp =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (isLocalHttp) {
    if (nodeEnv === 'production') {
      return `${PREFIX} may only use http://localhost[:port] or http://127.0.0.1[:port] outside production`;
    }
    return null;
  }
  if (url.protocol !== 'https:') {
    return `${PREFIX} must use https (http is allowed only for localhost/127.0.0.1 outside production)`;
  }
  return null;
}
