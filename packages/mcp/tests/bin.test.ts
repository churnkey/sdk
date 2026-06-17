import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const BIN = join(here, '..', 'dist', 'bin.js')

const tempDirs: string[] = []
function tempConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ck-mcp-bin-'))
  tempDirs.push(dir)
  return dir
}
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop() as string, { recursive: true, force: true })
})

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

function run(args: string[], env: Record<string, string>, killAfterMs?: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    let timer: NodeJS.Timeout | undefined
    if (killAfterMs) {
      timer = setTimeout(() => {
        child.kill('SIGTERM')
      }, killAfterMs)
    }
    child.on('error', reject)
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

describe('bin — auth subcommand routing', () => {
  it('`auth status` routes to status output (not authenticated)', async () => {
    const res = await run(['auth', 'status'], { CHURNKEY_CONFIG_DIR: tempConfigDir() })
    expect(res.stderr).toMatch(/Not authenticated/)
  })

  it('`auth <unknown>` prints usage and exits 1', async () => {
    const res = await run(['auth', 'bogus'], { CHURNKEY_CONFIG_DIR: tempConfigDir() })
    expect(res.stderr).toMatch(/Unknown auth subcommand/)
    expect(res.code).toBe(1)
  })
})

describe('bin — stdio transport (default) credential errors', () => {
  it('exits 1 with a sign-in hint when no credentials are present', async () => {
    const res = await run([], { CHURNKEY_CONFIG_DIR: tempConfigDir(), CHURNKEY_API_KEY: '', CHURNKEY_APP_ID: '' })
    expect(res.code).toBe(1)
    expect(res.stderr).toMatch(/Not authenticated|auth login/)
  })
})

describe('bin — HTTP transport selection', () => {
  it('--http starts the HTTP server (logs listening banner)', async () => {
    const res = await run(['--http'], { CHURNKEY_MCP_PORT: '0' }, 1500)
    expect(res.stderr).toMatch(/HTTP server listening/)
  })

  it('--transport=http starts the HTTP server', async () => {
    const res = await run(['--transport=http'], { CHURNKEY_MCP_PORT: '0' }, 1500)
    expect(res.stderr).toMatch(/HTTP server listening/)
  })

  it('CHURNKEY_MCP_TRANSPORT=http starts the HTTP server', async () => {
    const res = await run([], { CHURNKEY_MCP_TRANSPORT: 'http', CHURNKEY_MCP_PORT: '0' }, 1500)
    expect(res.stderr).toMatch(/HTTP server listening/)
  })

  it('HTTP transport with an invalid port exits 1 with a port error', async () => {
    const res = await run(['--http'], { CHURNKEY_MCP_PORT: '99999' })
    expect(res.code).toBe(1)
    expect(res.stderr).toMatch(/CHURNKEY_MCP_PORT/)
  })
})
