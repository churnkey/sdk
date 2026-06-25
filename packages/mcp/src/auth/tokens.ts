import { refreshTokens, type TokenResponse } from './oauth'
import { loadStoredAuth, type StoredAuth, saveStoredAuth } from './storage'

// Refresh slightly before expiry so in-flight requests don't race the deadline.
const EXPIRY_SKEW_MS = 60 * 1000

export function storedAuthFromTokenResponse(baseUrl: string, tokens: TokenResponse): StoredAuth {
  return {
    baseUrl,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    refreshToken: tokens.refresh_token,
    scopes: tokens.scope ? tokens.scope.split(' ') : [],
  }
}

export class NotAuthenticatedError extends Error {
  constructor(message = 'Not authenticated with Churnkey. Run `npx @churnkey/mcp auth login` first.') {
    super(message)
    this.name = 'NotAuthenticatedError'
  }
}

/**
 * Serves access tokens for API calls, transparently refreshing (with rotation)
 * against the stored refresh token. Refreshes are serialized so concurrent
 * tool calls can't double-rotate the refresh token.
 */
export class OAuthTokenProvider {
  private refreshing: Promise<string> | null = null

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async getAccessToken(forceRefresh = false): Promise<string> {
    const stored = loadStoredAuth(this.env)
    if (!stored) throw new NotAuthenticatedError()

    const expiresAt = Date.parse(stored.accessTokenExpiresAt || '') || 0
    const fresh = !forceRefresh && stored.accessToken && Date.now() < expiresAt - EXPIRY_SKEW_MS
    if (fresh) return stored.accessToken

    this.refreshing ??= this.refresh(stored).finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async refresh(stored: StoredAuth): Promise<string> {
    let tokens: TokenResponse
    try {
      tokens = await refreshTokens({ baseUrl: stored.baseUrl, refreshToken: stored.refreshToken })
    } catch (err) {
      const detail = err instanceof Error ? ` (${err.message})` : ''
      throw new NotAuthenticatedError(
        `Churnkey session expired or was revoked${detail}. Run \`npx @churnkey/mcp auth login\` to sign in again.`,
      )
    }
    const next = storedAuthFromTokenResponse(stored.baseUrl, tokens)
    saveStoredAuth(next, this.env)
    return next.accessToken
  }
}
