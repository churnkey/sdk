export interface ChurnkeyMcpConfig {
  appId: string
  apiKey: string
  baseUrl: string
}

const PRODUCTION_API_URL = 'https://api.churnkey.co/v1'
const LOCAL_API_URL = 'http://localhost:3000/v1'

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ChurnkeyMcpConfig {
  const appId = env.CHURNKEY_APP_ID
  const apiKey = env.CHURNKEY_API_KEY
  if (!appId) throw new Error('CHURNKEY_APP_ID environment variable is required')
  if (!apiKey) throw new Error('CHURNKEY_API_KEY environment variable is required')

  const baseUrl = env.CHURNKEY_API_URL ?? (isTruthy(env.CHURNKEY_USE_LOCAL_SERVER) ? LOCAL_API_URL : PRODUCTION_API_URL)
  return { appId, apiKey, baseUrl: baseUrl.replace(/\/$/, '') }
}

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}
