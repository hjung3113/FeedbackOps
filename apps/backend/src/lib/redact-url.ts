// Query-string redaction for request logs (issue #390).
//
// Fastify's default `req` serializer logs `req.url` verbatim, and for
// `GET /auth/callback` that URL carries the one-time OAuth authorization
// `code` and the anti-CSRF `state` — bearer-equivalent material. Pino's
// header redact paths (Review HTTP-M-3) do not cover query strings, so the
// `req` serializers in lib/logger.ts and buildServer run values of the keys
// below through this helper before logging.
//
// Keys and order are preserved; only the VALUES of sensitive keys change.
// The comparison uses the percent-decoded key name so `c%6Fde=` is caught
// too. Messages and errors must never echo credentials or tokens — this is
// the log-side half of that contract (issue #390 AC).

const SENSITIVE_QUERY_KEYS: Record<string, true> = {
  code: true,
  state: true,
  id_token: true,
  access_token: true,
  refresh_token: true,
  session_state: true,
  error_description: true,
  client_secret: true,
};

const REDACTED = '[redacted]';

function decodedKey(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function redactSensitiveQuery(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const prefix = url.slice(0, queryStart);
  const query = url.slice(queryStart + 1);
  // Split on '&' (not a regex over the whole query) so repetition and order
  // survive verbatim; only matched values are rewritten.
  const parts = query.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1) return pair;
    const name = pair.slice(0, eq);
    if (SENSITIVE_QUERY_KEYS[decodedKey(name)] === true) {
      return `${name}=${REDACTED}`;
    }
    return pair;
  });
  return `${prefix}?${parts.join('&')}`;
}
