import { resolveBaseUrl } from '../config'
import { runLoginFlow } from './login'
import { DEFAULT_SCOPES, revokeToken } from './oauth'
import { authFilePath, clearStoredAuth, loadStoredAuth, saveStoredAuth } from './storage'
import { storedAuthFromTokenResponse } from './tokens'

function out(message: string): void {
  process.stderr.write(`${message}\n`)
}

function parseScopesFlag(args: string[]): string[] | null {
  const index = args.findIndex((arg) => arg === '--scopes' || arg.startsWith('--scopes='))
  if (index === -1) return null
  const value = args[index].includes('=') ? args[index].split('=')[1] : args[index + 1]
  const scopes = (value ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return scopes.length ? scopes : null
}

export async function authLogin(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const baseUrl = resolveBaseUrl(env)
  const scopes = parseScopesFlag(args) ?? DEFAULT_SCOPES
  const tokens = await runLoginFlow({ baseUrl, scopes })
  saveStoredAuth(storedAuthFromTokenResponse(baseUrl, tokens), env)
  const granted = tokens.scope ? tokens.scope.split(' ') : []
  out(`\nAuthenticated with ${baseUrl}.`)
  out(`Granted scopes:\n${granted.map((s) => `  - ${s}`).join('\n')}`)
  out(`\nCredentials stored in ${authFilePath(env)} (refresh token, chmod 600).`)
  out('The MCP server will now authenticate as you — no CHURNKEY_API_KEY needed.')
}

export function authStatus(env: NodeJS.ProcessEnv = process.env): void {
  const stored = loadStoredAuth(env)
  if (!stored) {
    out('Not authenticated. Run `npx @churnkey/mcp auth login`.')
    if (env.CHURNKEY_API_KEY) {
      out('(CHURNKEY_API_KEY is set — the server will fall back to deprecated Data API key auth.)')
    }
    return
  }
  const expiresAt = Date.parse(stored.accessTokenExpiresAt || '') || 0
  const expired = Date.now() >= expiresAt
  out(`Authenticated against ${stored.baseUrl}`)
  out(
    `Access token: ${expired ? 'expired (will refresh automatically on next call)' : `valid until ${stored.accessTokenExpiresAt}`}`,
  )
  out(`Scopes:\n${stored.scopes.map((s) => `  - ${s}`).join('\n')}`)
  out(`Token file: ${authFilePath(env)}`)
}

export async function authLogout(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const stored = loadStoredAuth(env)
  if (stored) {
    try {
      // Revokes the whole grant server-side (RFC 7009), not just the local copy.
      await revokeToken({ baseUrl: stored.baseUrl, token: stored.refreshToken })
      out('Revoked the MCP session with Churnkey.')
    } catch {
      out('Could not reach Churnkey to revoke the session; removing local credentials anyway.')
    }
  }
  const removed = clearStoredAuth(env)
  out(removed ? `Removed ${authFilePath(env)}.` : 'No stored credentials found.')
}

export async function runAuthCommand(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const [subcommand = 'login', ...rest] = argv
  switch (subcommand) {
    case 'login':
      await authLogin(rest, env)
      return
    case 'status':
      authStatus(env)
      return
    case 'logout':
      await authLogout(env)
      return
    default:
      out(`Unknown auth subcommand: ${subcommand}`)
      out('Usage: npx @churnkey/mcp auth [login|status|logout] [--scopes scope1,scope2]')
      process.exitCode = 1
  }
}
