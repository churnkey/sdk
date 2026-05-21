#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_API_URL = 'http://localhost:3000/v1'

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stderr : process.stderr
  stream.write(`Usage:
  pnpm test:mcp --app-id <app_id> --api-key <data_api_key>

Options:
  --app-id <value>   Churnkey app ID. Falls back to CHURNKEY_APP_ID.
  --api-key <value>  Churnkey Data API key. Falls back to CHURNKEY_API_KEY.
  --api-url <value>  API base URL. Defaults to ${DEFAULT_API_URL}.

The command starts the local MCP server over stdio while churnkey-api is
running locally on port 3000.
`)
  process.exit(exitCode)
}

function parseArgs(argv) {
  const parsed = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') usage()

    if (arg.startsWith('--app-id=')) {
      parsed.appId = arg.slice('--app-id='.length)
    } else if (arg === '--app-id') {
      parsed.appId = argv[++i]
    } else if (arg.startsWith('--api-key=')) {
      parsed.apiKey = arg.slice('--api-key='.length)
    } else if (arg === '--api-key') {
      parsed.apiKey = argv[++i]
    } else if (arg.startsWith('--api-url=')) {
      parsed.apiUrl = arg.slice('--api-url='.length)
    } else if (arg === '--api-url') {
      parsed.apiUrl = argv[++i]
    } else {
      process.stderr.write(`Unknown option: ${arg}\n\n`)
      usage(1)
    }
  }

  return parsed
}

const args = parseArgs(process.argv.slice(2))
const env = { ...process.env }

if (args.appId) env.CHURNKEY_APP_ID = args.appId
if (args.apiKey) env.CHURNKEY_API_KEY = args.apiKey
env.CHURNKEY_API_URL = args.apiUrl || env.CHURNKEY_API_URL || DEFAULT_API_URL

if (!env.CHURNKEY_APP_ID) {
  process.stderr.write('Missing --app-id or CHURNKEY_APP_ID.\n\n')
  usage(1)
}

if (!env.CHURNKEY_API_KEY) {
  process.stderr.write('Missing --api-key or CHURNKEY_API_KEY.\n\n')
  usage(1)
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const binPath = join(scriptDir, '..', 'dist', 'bin.js')

if (!existsSync(binPath)) {
  process.stderr.write('Missing packages/mcp/dist/bin.js. Run `pnpm --filter @churnkey/mcp build` first.\n')
  process.exit(1)
}

process.stderr.write(`Starting Churnkey MCP against ${env.CHURNKEY_API_URL}\n`)

const child = spawn(process.execPath, [binPath], {
  env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
