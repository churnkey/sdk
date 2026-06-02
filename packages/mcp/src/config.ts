export interface ChurnkeyMcpConfig {
  appId: string
  apiKey: string
  baseUrl: string
}

export interface ChurnkeyMcpHttpConfig {
  host: string
  port: number
  path: string
  allowedHosts?: string[]
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ChurnkeyMcpConfig {
  const appId = env.CHURNKEY_APP_ID
  const apiKey = env.CHURNKEY_API_KEY
  if (!appId) throw new Error('CHURNKEY_APP_ID environment variable is required')
  if (!apiKey) throw new Error('CHURNKEY_API_KEY environment variable is required')

  const baseUrl = env.CHURNKEY_API_URL ?? 'https://api.churnkey.co/v1'
  return normalizeConfig({ appId, apiKey, baseUrl })
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

export function loadHttpRequestConfig(headers: Headers, env: NodeJS.ProcessEnv = process.env): ChurnkeyMcpConfig {
  const appId = headers.get('x-ck-app') ?? env.CHURNKEY_APP_ID
  const apiKey = headers.get('x-ck-api-key') ?? readBearerToken(headers) ?? env.CHURNKEY_API_KEY
  if (!appId) throw new Error('Missing Churnkey App ID. Send x-ck-app or set CHURNKEY_APP_ID.')
  if (!apiKey)
    throw new Error(
      'Missing Churnkey API key. Send x-ck-api-key, Authorization: Bearer <key>, or set CHURNKEY_API_KEY.',
    )

  const baseUrl = env.CHURNKEY_API_URL ?? 'https://api.churnkey.co/v1'
  return normalizeConfig({ appId, apiKey, baseUrl })
}

function normalizeConfig(config: ChurnkeyMcpConfig): ChurnkeyMcpConfig {
  return { ...config, baseUrl: config.baseUrl.replace(/\/$/, '') }
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
