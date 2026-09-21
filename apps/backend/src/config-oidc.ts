// OIDC env validation (issue #390).
//
// AUTH_PROVIDER=oidc turns the four OIDC_* vars into boot requirements and
// pins strict URL rules — a misconfigured issuer or redirect URI must fail
// config load, never the first login. AUTH_PROVIDER=mock ignores them
// entirely (not required, not validated).
//
// Returns null when the configuration is acceptable for the selected
// provider, otherwise one issue per violated variable.
//
// Messages NEVER echo any input value — especially the client secret and any
// URL, which misconfigured deployments may carry credentials in. Only
// variable names and rule descriptions appear (same rule as
// config-attachment-origin.ts).

export interface OidcEnvInput {
  authProvider: 'mock' | 'oidc';
  nodeEnv: 'development' | 'test' | 'production';
  issuerUrl: string | undefined;
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string | undefined;
  scopes: string | undefined;
}

export interface OidcConfigIssue {
  path: string;
  message: string;
}

const OIDC_REQUIRED_VARS = [
  'OIDC_ISSUER_URL',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
] as const;

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function validateIssuerUrl(value: string, nodeEnv: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'OIDC_ISSUER_URL must be an absolute URL';
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return 'OIDC_ISSUER_URL must not contain credentials (user:password@)';
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    return 'OIDC_ISSUER_URL must not contain a query or fragment';
  }
  const isLocalHttp = url.protocol === 'http:' && isLocalHost(url.hostname);
  if (isLocalHttp) {
    if (nodeEnv === 'production') {
      return 'OIDC_ISSUER_URL must use https in production (plain http is allowed only for localhost/127.0.0.1 outside production)';
    }
    return null;
  }
  if (url.protocol !== 'https:') {
    return 'OIDC_ISSUER_URL must use https (plain http is allowed only for localhost/127.0.0.1 outside production)';
  }
  return null;
}

function validateRedirectUri(value: string, nodeEnv: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'OIDC_REDIRECT_URI must be an absolute URL whose path is exactly /auth/callback';
  }
  if (url.hash.length > 0) {
    return 'OIDC_REDIRECT_URI must not contain a fragment';
  }
  // The token request's redirect_uri is sent without the callback's query, so
  // a configured query string can never match what the IdP registered.
  if (url.search.length > 0) {
    return 'OIDC_REDIRECT_URI must not contain a query string';
  }
  if (url.pathname !== '/auth/callback') {
    return 'OIDC_REDIRECT_URI path must be exactly /auth/callback';
  }
  const isLocalHttp = url.protocol === 'http:' && isLocalHost(url.hostname);
  if (isLocalHttp) {
    if (nodeEnv === 'production') {
      return 'OIDC_REDIRECT_URI must use https in production (http://localhost or http://127.0.0.1 is allowed only outside production)';
    }
    return null;
  }
  if (url.protocol !== 'https:') {
    return 'OIDC_REDIRECT_URI must use https in production (http://localhost or http://127.0.0.1 is allowed only outside production)';
  }
  return null;
}

export function validateOidcConfig(input: OidcEnvInput): OidcConfigIssue[] | null {
  if (input.authProvider !== 'oidc') return null;

  const issues: OidcConfigIssue[] = [];
  const values: Record<(typeof OIDC_REQUIRED_VARS)[number], string | undefined> = {
    OIDC_ISSUER_URL: input.issuerUrl,
    OIDC_CLIENT_ID: input.clientId,
    OIDC_CLIENT_SECRET: input.clientSecret,
    OIDC_REDIRECT_URI: input.redirectUri,
  };
  for (const name of OIDC_REQUIRED_VARS) {
    const value = values[name];
    if (value === undefined || value.trim().length === 0) {
      issues.push({ path: name, message: `${name} is required when AUTH_PROVIDER=oidc` });
    }
  }
  if (issues.length > 0) return issues;

  const issuerIssue = validateIssuerUrl(input.issuerUrl as string, input.nodeEnv);
  if (issuerIssue) issues.push({ path: 'OIDC_ISSUER_URL', message: issuerIssue });

  const redirectIssue = validateRedirectUri(input.redirectUri as string, input.nodeEnv);
  if (redirectIssue) issues.push({ path: 'OIDC_REDIRECT_URI', message: redirectIssue });

  const scopes = (input.scopes ?? '').trim();
  // RFC 6749 §3.3: single-space-separated scope-tokens of printable ASCII
  // without '"' or '\\'. Anything else (newline, tab, double spaces) would be
  // sent verbatim to the IdP and break every login.
  const SCOPE_TOKEN = '[\\x21\\x23-\\x5B\\x5D-\\x7E]+';
  const scopeGrammar = new RegExp(`^${SCOPE_TOKEN}( ${SCOPE_TOKEN})*$`);
  if (!scopeGrammar.test(scopes) || !scopes.split(' ').includes('openid')) {
    issues.push({
      path: 'OIDC_SCOPES',
      message:
        'OIDC_SCOPES must be single-space-separated scope tokens (no control characters) and include openid, e.g. "openid email profile"',
    });
  }

  return issues.length > 0 ? issues : null;
}
