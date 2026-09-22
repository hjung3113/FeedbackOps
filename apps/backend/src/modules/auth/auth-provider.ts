// ADR-0006:5-14. The auth module exposes only this abstraction. Application
// services, controllers, and middleware never branch on AUTH_PROVIDER — they
// receive an AuthProvider via DI and call its methods. The seam below is
// provider-agnostic: mock returns the dev-only HTML picker from startLogin;
// OIDC returns a redirect + provider cookies (issue #390).

export interface AuthClaims {
  /** Subject — stable provider identifier; persisted to `core.actors.external_id`. */
  sub: string;
  email: string;
  display_name: string;
  /** Raw provider payload for audit; opaque to the rest of the app. */
  raw_claims: Record<string, unknown>;
}

export interface CompleteLoginInput {
  /** Provider-specific parameters (mock: chosen external_id; OIDC: callback query). */
  [key: string]: unknown;
}

/** Cookie a provider asks the route to set on `startLogin` (e.g. the OIDC
 * transaction cookie). Routes apply httpOnly/sameSite=lax/secure per nodeEnv. */
export interface ProviderCookie {
  name: string;
  value: string;
  maxAgeSeconds: number;
  path: string;
}

/** Response a `GET /auth/login` should produce: the mock's dev-only HTML
 * picker, or a 302 target plus cookies to set before redirecting. */
export type LoginStart = { html: string } | { redirect: string; cookies: ProviderCookie[] };

export interface StartLoginContext {
  /** Post-login redirect target. Providers must reject non-same-origin values. */
  returnTo?: string;
}

/**
 * Claims plus login-flow output the route consumes after `completeLogin`.
 * The extras are optional so the mock's existing
 * `completeLogin(input): Promise<AuthClaims>` contract stays untouched
 * (issue #390 smallest-change decision).
 */
export type CompleteLoginResult = AuthClaims & {
  /** Same-origin path to redirect to after the session is issued ('/' default). */
  returnTo?: string;
  /** Provider cookies the route must clear on this response (e.g. the single-use OIDC transaction cookie). */
  clearCookies?: Array<{ name: string; path: string }>;
};

export interface AuthProvider {
  /** Provider name surfaced in logs only. */
  readonly name: 'mock' | 'oidc';
  /**
   * Begins a login. For the mock provider this is the dev-only HTML picker;
   * for OIDC it is a 302 to the IdP authorization endpoint plus the
   * transaction cookie to set first.
   */
  startLogin(ctx?: StartLoginContext): Promise<LoginStart>;
  /** Resolves provider-side credentials into canonical claims. */
  completeLogin(input: CompleteLoginInput): Promise<CompleteLoginResult>;
}
