import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { buildAuthorizeUrl, exchangeCode, generatePkce, type TokenResponse } from './oauth'

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000

const SUCCESS_HTML = `<!doctype html><html><body style="font-family: system-ui; text-align: center; padding-top: 4rem">
<h2>Churnkey MCP is connected</h2><p>You can close this tab and return to your terminal.</p>
</body></html>`

function errorHtml(message: string): string {
  return `<!doctype html><html><body style="font-family: system-ui; text-align: center; padding-top: 4rem">
<h2>Authentication failed</h2><p>${message}</p><p>Return to your terminal and try again.</p>
</body></html>`
}

function openBrowser(url: string): void {
  const platform = process.platform
  const [command, args] =
    platform === 'darwin'
      ? ['open', [url]]
      : platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {
    // Headless or restricted environments: the URL is printed, user opens it manually.
  })
  child.unref()
}

/**
 * Runs the full OAuth 2.1 authorization-code + PKCE login: starts a loopback
 * callback server on a random port, opens the browser at the authorize URL,
 * waits for the redirect, and exchanges the code for tokens.
 */
export async function runLoginFlow(options: {
  baseUrl: string
  scopes: string[]
  log?: (message: string) => void
}): Promise<TokenResponse> {
  const log = options.log ?? ((message: string) => process.stderr.write(`${message}\n`))
  const { verifier, challenge } = generatePkce()
  const state = randomBytes(16).toString('base64url')

  let resolveCode: (value: string) => void
  let rejectCode: (reason: Error) => void
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/callback') {
      res.writeHead(404).end()
      return
    }
    const error = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    if (error) {
      res.writeHead(200, { 'content-type': 'text/html' }).end(errorHtml(error))
      rejectCode(new Error(error === 'access_denied' ? 'Authorization was denied.' : `Authorization failed: ${error}`))
      return
    }
    if (!code || returnedState !== state) {
      res.writeHead(400, { 'content-type': 'text/html' }).end(errorHtml('Missing code or state mismatch.'))
      rejectCode(new Error('OAuth callback was missing the code or returned a mismatched state.'))
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(SUCCESS_HTML)
    resolveCode(code)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const port = (server.address() as AddressInfo).port
  const redirectUri = `http://127.0.0.1:${port}/callback`

  const authorizeUrl = buildAuthorizeUrl({
    baseUrl: options.baseUrl,
    redirectUri,
    scopes: options.scopes,
    state,
    codeChallenge: challenge,
  })

  log('Opening your browser to sign in to Churnkey…')
  log(`If it does not open automatically, visit:\n\n  ${authorizeUrl}\n`)
  openBrowser(authorizeUrl)

  const timeout = setTimeout(() => {
    rejectCode(new Error('Timed out waiting for the browser sign-in (5 minutes).'))
  }, CALLBACK_TIMEOUT_MS)

  try {
    const code = await codePromise
    log('Signed in. Exchanging the authorization code for tokens…')
    return await exchangeCode({ baseUrl: options.baseUrl, code, codeVerifier: verifier, redirectUri })
  } finally {
    clearTimeout(timeout)
    server.close()
  }
}
