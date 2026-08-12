import { createHash, randomBytes } from 'node:crypto'

export const OAUTH_CLIENT_ID = 'churnkey-mcp'

// Mirrors the server-side scope catalog (churnkey-api src/api/oauth/oauth.scopes.js).
// This is what `auth login` requests: running it is a deliberate act by someone
// setting up their own workstation, who then reviews and unchecks on the consent
// screen. Remote clients get BASELINE_SCOPES instead — see below.
export const DEFAULT_SCOPES = [
  'cancel_flows.blueprints.read',
  'cancel_flows.blueprints.write',
  'cancel_flows.metrics.read',
  'cancel_flows.sessions.read',
  'cancel_flows.sessions.read_pii',
  'cancel_flows.adaptive_offers.read',
  'cancel_flows.adaptive_offers.write',
  'stripe_settings.read',
  'stripe_settings.write',
  'dns.read',
  'dns.write',
  'ab_test.read',
  'ab_test.write',
  'payment_recovery.metrics.read',
  'payment_recovery.blueprints.read',
  'payment_recovery.blueprints.write',
  'payment_recovery.campaigns.read',
  'payment_recovery.campaigns.read_pii',
  'payment_recovery.campaigns.write',
  'account.api_usage.read',
  'account.audit_log.read',
  // No dsr.write — no tool here can exercise it, and asking for a grant we
  // never use is what a directory review reads as over-scoping.
  'dsr.read',
]

/**
 * What a remote client asks for on first connect.
 *
 * A client with no configured scopes takes the `scope` from our 401 challenge,
 * or failing that everything in the protected-resource `scopes_supported`
 * (MCP authorization spec, Scope Selection Strategy). Advertising the full
 * catalog there is why Claude and ChatGPT arrive at a consent screen with every
 * write and both PII scopes pre-checked — the user is asked to approve the
 * ability to edit live flows before they have read anything.
 *
 * So this is the "minimal set necessary for basic functionality" the spec asks
 * for: orientation and analytics. `get_account` needs no scope at all, so a
 * client can always work out which workspace and mode it is in.
 *
 * Everything omitted is still grantable — the authorization server's catalog is
 * unchanged. A tool that needs more fails with the exact scope name, and the
 * user reauthorizes with it.
 */
export const BASELINE_SCOPES = [
  'cancel_flows.blueprints.read',
  'cancel_flows.metrics.read',
  'cancel_flows.sessions.read',
  'payment_recovery.metrics.read',
  'payment_recovery.blueprints.read',
  'payment_recovery.campaigns.read',
  'ab_test.read',
]

export interface PkcePair {
  verifier: string
  challenge: string
}

export function generatePkce(): PkcePair {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope: string
}

export function buildAuthorizeUrl(options: {
  baseUrl: string
  redirectUri: string
  scopes: string[]
  state: string
  codeChallenge: string
}): string {
  const url = new URL(`${options.baseUrl}/oauth/authorize`)
  url.searchParams.set('client_id', OAUTH_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('scope', options.scopes.join(' '))
  url.searchParams.set('state', options.state)
  url.searchParams.set('code_challenge', options.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

async function tokenRequest(baseUrl: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: OAUTH_CLIENT_ID, ...body }),
  })
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  if (!res.ok) {
    const description =
      parsed && typeof parsed === 'object' && 'error_description' in parsed
        ? String((parsed as { error_description: unknown }).error_description)
        : text || `HTTP ${res.status}`
    throw new OAuthRequestError(description, res.status)
  }
  return parsed as TokenResponse
}

export class OAuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'OAuthRequestError'
  }
}

export function exchangeCode(options: {
  baseUrl: string
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<TokenResponse> {
  return tokenRequest(options.baseUrl, {
    grant_type: 'authorization_code',
    code: options.code,
    code_verifier: options.codeVerifier,
    redirect_uri: options.redirectUri,
  })
}

export function refreshTokens(options: { baseUrl: string; refreshToken: string }): Promise<TokenResponse> {
  return tokenRequest(options.baseUrl, {
    grant_type: 'refresh_token',
    refresh_token: options.refreshToken,
  })
}

export async function revokeToken(options: { baseUrl: string; token: string }): Promise<void> {
  await fetch(`${options.baseUrl}/oauth/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: OAUTH_CLIENT_ID, token: options.token }),
  })
}
