import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface StoredAuth {
  baseUrl: string
  accessToken: string
  /** ISO timestamp after which the access token must be refreshed. */
  accessTokenExpiresAt: string
  refreshToken: string
  scopes: string[]
}

export function authFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.CHURNKEY_CONFIG_DIR ?? join(homedir(), '.churnkey')
  return join(dir, 'mcp-auth.json')
}

export function loadStoredAuth(env: NodeJS.ProcessEnv = process.env): StoredAuth | null {
  const path = authFilePath(env)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredAuth
    if (!parsed.refreshToken || !parsed.baseUrl) return null
    return parsed
  } catch {
    return null
  }
}

export function saveStoredAuth(auth: StoredAuth, env: NodeJS.ProcessEnv = process.env): void {
  const path = authFilePath(env)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 })
  // mode on writeFileSync does not apply when the file already exists.
  chmodSync(path, 0o600)
}

export function clearStoredAuth(env: NodeJS.ProcessEnv = process.env): boolean {
  const path = authFilePath(env)
  if (!existsSync(path)) return false
  rmSync(path)
  return true
}
