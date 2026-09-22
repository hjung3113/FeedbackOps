// In-process OpenID Connect IdP for the #390 provider tests. Listens on
// 127.0.0.1:0 (ephemeral port) and speaks enough of the protocol for the
// authorization-code + PKCE flow driven by OidcAuthProvider:
//
//   GET /.well-known/openid-configuration  discovery (issuer = own base URL)
//   GET /jwks                              RS256 public key
//   POST /token                            client_secret_basic auth, code
//                                          single-use, redirect_uri match,
//                                          S256(code_verifier) check
//
// There is no browser: `authorize(authUrl)` validates the authorization
// request the way an IdP front-end would and returns the callback URL
// (`redirect_uri?code=…&state=…`); the test injects it at /auth/callback.
//
// Tamper knobs (one-shot, for the NEXT token response):
//   nextIdToken({ nonce?, aud?, iss?, expired?, badSignature?, omitEmail? })
//   failToken() — next /token call returns a 500 with a recognizable
//                 error_description the tests assert never leaks.
//
// Hermetic: no DNS, no external network. Uses jose for RS256 signing and
// node:http for the server.

import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { SignJWT, exportJWK, generateKeyPair } from 'jose';

export interface FakeOidcIdpOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Shape the discovery document: drop keys and/or change advertised auth methods. */
  discovery?: { omit?: string[]; tokenEndpointAuthMethods?: string[] };
}

export interface FakeProfileOverride {
  sub?: string;
  email?: string;
  name?: string;
}

export interface FakeIdTokenOverride {
  nonce?: string;
  aud?: string;
  iss?: string;
  expired?: boolean;
  badSignature?: boolean;
  omitEmail?: boolean;
  /** Adds an explicit `email_verified` claim. */
  emailVerified?: boolean;
}

interface IssuedCode {
  redirectUri: string;
  challenge: string;
  nonce: string;
}

const IDP_REJECT_DETAIL = 'IDP-TOKEN-REJECT-DETAIL';
const IDP_FAILURE_DETAIL = 'IDP-TOKEN-ENDPOINT-FAILURE-DETAIL';

export class FakeOidcIdp {
  readonly issuer: string;
  private readonly server: Server;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly keyPair = generateKeyPair('RS256', { extractable: true });
  private readonly altKeyPair = generateKeyPair('RS256', { extractable: true });
  private readonly kid = randomBytes(8).toString('hex');
  private readonly codes = new Map<string, IssuedCode>();
  private profile = {
    sub: 'oidc-it-sub-1',
    email: 'oidc.it.user@example.com',
    name: 'Oidc IT User',
  };
  private nextTokenOverride: FakeIdTokenOverride | null = null;
  private nextTokenFails = false;
  private readonly discoveryShape: NonNullable<FakeOidcIdpOptions['discovery']>;

  private constructor(server: Server, port: number, opts: FakeOidcIdpOptions) {
    this.server = server;
    this.issuer = `http://127.0.0.1:${port}`;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.redirectUri = opts.redirectUri;
    this.discoveryShape = opts.discovery ?? {};
  }

  static async start(opts: FakeOidcIdpOptions): Promise<FakeOidcIdp> {
    let idp: FakeOidcIdp;
    const server = createServer((req, res) => {
      idp?.handle(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address() as AddressInfo;
    idp = new FakeOidcIdp(server, address.port, opts);
    return idp;
  }

  /** Shuts the listener down; pending sockets are destroyed to keep vitest
   * from waiting on keep-alive connections. */
  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
      this.server.closeAllConnections();
    });
  }

  get discoveryUrl(): string {
    return `${this.issuer}/.well-known/openid-configuration`;
  }

  setProfile(override: FakeProfileOverride): void {
    this.profile = { ...this.profile, ...override };
  }

  /** One-shot: the NEXT token response embeds the tampered ID Token claims. */
  nextIdToken(override: FakeIdTokenOverride): void {
    this.nextTokenOverride = override;
  }

  /** One-shot: the NEXT token request gets a 500 failure. */
  failToken(): void {
    this.nextTokenFails = true;
  }

  /** Plays the IdP authorization front-end: validates the authorization
   * request parameters, issues a single-use code, and returns the callback
   * URL the browser would be redirected to. */
  authorize(authUrl: string | URL): string {
    const url = new URL(authUrl);
    const params = url.searchParams;
    const problems: string[] = [];
    if (params.get('client_id') !== this.clientId) problems.push('client_id');
    if (params.get('redirect_uri') !== this.redirectUri) problems.push('redirect_uri');
    if (params.get('response_type') !== 'code') problems.push('response_type');
    if (!params.get('scope')?.split(' ').includes('openid')) problems.push('scope');
    if (params.get('code_challenge_method') !== 'S256') problems.push('code_challenge_method');
    if (!params.get('code_challenge')) problems.push('code_challenge');
    if (!params.get('state')) problems.push('state');
    if (!params.get('nonce')) problems.push('nonce');
    if (problems.length > 0) {
      throw new Error(`fake IdP authorize rejected: ${problems.join(', ')}`);
    }
    const code = randomBytes(16).toString('base64url');
    this.codes.set(code, {
      redirectUri: params.get('redirect_uri') as string,
      challenge: params.get('code_challenge') as string,
      nonce: params.get('nonce') as string,
    });
    return `${this.redirectUri}?code=${code}&state=${params.get('state')}`;
  }

  // ── HTTP plumbing ─────────────────────────────────────────────────────

  private async readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.issuer);
    try {
      if (url.pathname === '/.well-known/openid-configuration') {
        const doc: Record<string, unknown> = {
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          jwks_uri: `${this.issuer}/jwks`,
          response_types_supported: ['code'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: this.discoveryShape.tokenEndpointAuthMethods ?? [
            'client_secret_basic',
          ],
          code_challenge_methods_supported: ['S256'],
          subject_types_supported: ['public'],
        };
        for (const key of this.discoveryShape.omit ?? []) delete doc[key];
        this.json(res, 200, doc);
        return;
      }
      if (url.pathname === '/jwks') {
        const jwk = await exportJWK((await this.keyPair).publicKey);
        this.json(res, 200, { keys: [{ ...jwk, kid: this.kid, alg: 'RS256', use: 'sig' }] });
        return;
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        await this.token(req, res);
        return;
      }
      this.json(res, 404, { error: 'not_found' });
    } catch (err) {
      // Unexpected handler failure: surfaced to the test via the response so
      // it fails loudly instead of hanging the flow.
      this.json(res, 500, {
        error: 'idp_internal',
        error_description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private basicCredentials(req: IncomingMessage): { id: string; secret: string } | null {
    const header = req.headers.authorization;
    if (header === undefined || !header.startsWith('Basic ')) return null;
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon === -1) return null;
    // RFC 6749 form-encodes client credentials (oauth4webapi sends
    // 'probe%2Drp'); decode both parts before comparing.
    const part = (raw: string): string => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    };
    return { id: part(decoded.slice(0, colon)), secret: part(decoded.slice(colon + 1)) };
  }

  private async token(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.nextTokenFails) {
      this.nextTokenFails = false;
      this.json(res, 500, { error: 'server_error', error_description: IDP_FAILURE_DETAIL });
      return;
    }

    const creds = this.basicCredentials(req);
    if (creds === null || creds.id !== this.clientId || creds.secret !== this.clientSecret) {
      this.json(res, 401, { error: 'invalid_client', error_description: IDP_REJECT_DETAIL });
      return;
    }

    const form = new URLSearchParams(await this.readBody(req));
    const code = form.get('code');
    const redirectUri = form.get('redirect_uri');
    const verifier = form.get('code_verifier');
    const issued = code !== null ? this.codes.get(code) : undefined;
    if (issued === undefined || code === null) {
      this.json(res, 400, { error: 'invalid_grant', error_description: IDP_REJECT_DETAIL });
      return;
    }
    // Single-use: consume before validating so replays always fail.
    this.codes.delete(code);
    if (redirectUri !== issued.redirectUri) {
      this.json(res, 400, { error: 'invalid_grant', error_description: IDP_REJECT_DETAIL });
      return;
    }
    if (
      verifier === null ||
      createHash('sha256').update(verifier).digest('base64url') !== issued.challenge
    ) {
      this.json(res, 400, { error: 'invalid_grant', error_description: IDP_REJECT_DETAIL });
      return;
    }

    const override = this.nextTokenOverride ?? {};
    this.nextTokenOverride = null;
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {
      sub: this.profile.sub,
      nonce: override.nonce ?? issued.nonce,
      name: this.profile.name,
    };
    if (!override.omitEmail) payload['email'] = this.profile.email;
    if (override.emailVerified !== undefined) payload['email_verified'] = override.emailVerified;
    const signingPair = override.badSignature === true ? this.altKeyPair : this.keyPair;
    const idToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: this.kid })
      .setIssuedAt()
      .setExpirationTime(override.expired === true ? now - 3600 : now + 300)
      .setIssuer(override.iss ?? this.issuer)
      .setAudience(override.aud ?? this.clientId)
      .sign((await signingPair).privateKey);

    this.json(res, 200, {
      access_token: randomBytes(16).toString('base64url'),
      token_type: 'Bearer',
      expires_in: 60,
      id_token: idToken,
    });
  }
}
