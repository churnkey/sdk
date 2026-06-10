import { loadStoredAuth } from './auth/storage'

export type ChurnkeyAuth =
  /** Workspace-shared Data API key. Deprecated for MCP use; read-only on the API. */
  | { kind: 'data-api-key'; appId: string; apiKey: string }
  /** Per-user OAuth managed via the local token store (`npx @churnkey/mcp auth login`). */
  | { kind: 'oauth' }
  /** A caller-supplied OAuth access token (hosted Streamable HTTP transport). */
  | { kind: 'bearer'; token: string }

export interface ChurnkeyMcpConfig {
  baseUrl: string
  auth: ChurnkeyAuth
  /** OAuth/bearer requests select test mode explicitly (Data API keys encode it in the key prefix). */
  mode?: 'live' | 'test'
}

export interface ChurnkeyMcpHttpConfig {
  host: string
  port: number
  path: string
  allowedHosts?: string[]
}

export function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const baseUrl = env.CHURNKEY_API_URL ?? 'https://api.churnkey.co/v1'
  return baseUrl.replace(/\/$/, '')
}

function resolveMode(env: NodeJS.ProcessEnv): 'test' | undefined {
  return env.CHURNKEY_MODE?.toLowerCase() === 'test' ? 'test' : undefined
}

let warnedDeprecatedApiKey = false
function warnDeprecatedApiKeyAuth(): void {
  if (warnedDeprecatedApiKey) return
  warnedDeprecatedApiKey = true
  process.stderr.write(
    'Churnkey MCP: CHURNKEY_API_KEY auth is deprecated and limited to read-only data endpoints. ' +
      'Run `npx @churnkey/mcp auth login` to authenticate as your Churnkey user (required for configuration writes).\n',
  )
}

/**
 * Resolves stdio-transport credentials. Precedence:
 * 1. CHURNKEY_APP_ID + CHURNKEY_API_KEY env vars (deprecated, read-only)
 * 2. Stored OAuth tokens from `npx @churnkey/mcp auth login`
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ChurnkeyMcpConfig {
  const appId = env.CHURNKEY_APP_ID
  const apiKey = env.CHURNKEY_API_KEY

  if (apiKey) {
    if (!appId) throw new Error('CHURNKEY_APP_ID is required when CHURNKEY_API_KEY is set')
    warnDeprecatedApiKeyAuth()
    return { baseUrl: resolveBaseUrl(env), auth: { kind: 'data-api-key', appId, apiKey } }
  }

  const stored = loadStoredAuth(env)
  if (stored) {
    // Tokens are only valid against the API that issued them, so the stored
    // base URL wins over CHURNKEY_API_URL for OAuth sessions.
    return { baseUrl: stored.baseUrl.replace(/\/$/, ''), auth: { kind: 'oauth' }, mode: resolveMode(env) }
  }

  throw new Error(
    'Not authenticated with Churnkey. Run `npx @churnkey/mcp auth login` to sign in, ' +
      'or set CHURNKEY_APP_ID + CHURNKEY_API_KEY for deprecated read-only Data API key auth.',
  )
}

export function loadHttpServerConfig(env: NodeJS.ProcessEnv = process.env): ChurnkeyMcpHttpConfig {
  const port = Number(env.CHURNKEY_MCP_PORT ?? 3333)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('CHURNKEY_MCP_PORT must be an integer between 1 and 65535')
  }

  const path = env.CHURNKEY_MCP_PATH ?? '/mcp'
  if (!path.startsWith('/')) {
    throw new Error('CHURNKEY_MCP_PATH must start with /')
  }

  const allowedHosts = splitCsv(env.CHURNKEY_MCP_ALLOWED_HOSTS)
  return {
    host: env.CHURNKEY_MCP_HOST ?? '127.0.0.1',
    port,
    path,
    allowedHosts: allowedHosts.length ? allowedHosts : undefined,
  }
}

/**
 * Resolves per-request credentials for the Streamable HTTP transport.
 *
 * `Authorization: Bearer ck_oat_…` (a Churnkey MCP OAuth access token) is the
 * hosted-auth path — no app id needed, the API resolves user/org/scopes from
 * the token. Data API keys (x-ck-api-key or a non-OAuth bearer value) remain
 * accepted for read-only use and still require x-ck-app.
 */
export function loadHttpRequestConfig(headers: Headers, env: NodeJS.ProcessEnv = process.env): ChurnkeyMcpConfig {
  const baseUrl = resolveBaseUrl(env)
  const bearer = readBearerToken(headers)

  if (bearer?.startsWith('ck_oat_')) {
    const modeHeader = headers.get('x-ck-mode')?.toLowerCase()
    return {
      baseUrl,
      auth: { kind: 'bearer', token: bearer },
      mode: modeHeader === 'test' ? 'test' : resolveMode(env),
    }
  }

  const appId = headers.get('x-ck-app') ?? env.CHURNKEY_APP_ID
  const apiKey = headers.get('x-ck-api-key') ?? bearer ?? env.CHURNKEY_API_KEY
  if (!appId) throw new Error('Missing Churnkey App ID. Send x-ck-app or set CHURNKEY_APP_ID.')
  if (!apiKey)
    throw new Error(
      'Missing Churnkey credentials. Send Authorization: Bearer <OAuth access token>, x-ck-api-key, or set CHURNKEY_API_KEY.',
    )

  return { baseUrl, auth: { kind: 'data-api-key', appId, apiKey } }
}

function readBearerToken(headers: Headers): string | undefined {
  const authorization = headers.get('authorization')
  if (!authorization) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim())
  return match?.[1]?.trim()
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
