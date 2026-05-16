// ADR-0006:5-14. The auth module exposes only this abstraction. Application
// services, controllers, and middleware never branch on AUTH_PROVIDER — they
// receive an AuthProvider via DI and call its methods. OidcAuthProvider is
// NOT introduced in Slice 1 #3 (premature per the locked decisions).

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

export interface AuthProvider {
  /** Provider name surfaced in logs only. */
  readonly name: 'mock' | 'oidc';
  /**
   * Returns the response a `GET /auth/<provider>/login` should produce. For
   * the mock provider this is the dev-only HTML picker; for OIDC it would be
   * a 302 to the IdP. Slice 1 #3 only needs the mock branch.
   */
  startLogin(): Promise<{ html: string }>;
  /** Resolves provider-side credentials into canonical claims. */
  completeLogin(input: CompleteLoginInput): Promise<AuthClaims>;
}
