export interface ChurnkeyMcpConfig {
  appId: string
  apiKey: string
  baseUrl: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ChurnkeyMcpConfig {
  const appId = env.CHURNKEY_APP_ID
  const apiKey = env.CHURNKEY_API_KEY
  if (!appId) throw new Error('CHURNKEY_APP_ID environment variable is required')
  if (!apiKey) throw new Error('CHURNKEY_API_KEY environment variable is required')

  const baseUrl = env.CHURNKEY_API_URL ?? 'https://api.churnkey.co/v1'
  return { appId, apiKey, baseUrl: baseUrl.replace(/\/$/, '') }
}
