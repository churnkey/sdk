#!/usr/bin/env node
// Scriptable end-to-end smoke test: spawns the built MCP server over stdio (via the MCP SDK client),
// calls the blueprint/segment tools against a local churnkey-api, and asserts the new contract shapes.
// Reads CHURNKEY_APP_ID / CHURNKEY_API_KEY / CHURNKEY_API_URL from env (or --app-id/--api-key flags).
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const argv = process.argv.slice(2)
function flag(name) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const appId = flag('app-id') || process.env.CHURNKEY_APP_ID
const apiKey = flag('api-key') || process.env.CHURNKEY_API_KEY
const apiUrl = flag('api-url') || process.env.CHURNKEY_API_URL || 'http://localhost:3000/v1'
if (!appId || !apiKey) {
  console.error('Missing credentials. Pass --app-id and --api-key (or set CHURNKEY_APP_ID / CHURNKEY_API_KEY).')
  process.exit(2)
}

const binPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'bin.js')

const results = []
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function call(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args })
  const text = res.content?.map((c) => c.text).join('') ?? ''
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { isError: Boolean(res.isError), text, json }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [binPath],
  env: { ...process.env, CHURNKEY_APP_ID: appId, CHURNKEY_API_KEY: apiKey, CHURNKEY_API_URL: apiUrl },
})
const client = new Client({ name: 'churnkey-smoke', version: '0.0.0' })

try {
  console.log(`\nConnecting to MCP server (API ${apiUrl}, app ${appId})...\n`)
  await client.connect(transport)

  const tools = await client.listTools()
  check('server lists tools', tools.tools.length >= 10, `${tools.tools.length} tools`)

  // --- list_blueprints (D1 + D2) ---
  const bp = await call(client, 'list_blueprints')
  if (bp.isError) {
    check('list_blueprints succeeds', false, bp.text)
  } else {
    const flows = bp.json?.flows ?? []
    const org = flows.find((f) => f.scope === 'org')
    const seg = flows.find((f) => f.scope === 'segment')
    check('list_blueprints returns flows[]', Array.isArray(flows), `${flows.length} flows`)
    check('D1: org default flow always present', Boolean(org), org ? `status=${org.status}` : 'missing')
    check(
      'D2: hasUnpublishedChanges present on every flow',
      flows.length > 0 && flows.every((f) => typeof f.hasUnpublishedChanges === 'boolean'),
      org ? `org.hasUnpublishedChanges=${org.hasUnpublishedChanges}` : '',
    )
    check(
      'status uses lowercase enum (active/setup_pending/inactive)',
      flows.every((f) => ['active', 'setup_pending', 'inactive'].includes(f.status)),
    )
    if (seg) {
      check('D4: embedded segment exposes priority (not order)', typeof seg.segment?.priority === 'number' && !('order' in seg.segment))
      check('D5: embedded segment exposes filter[]', Array.isArray(seg.segment?.filter))
    } else {
      console.log('   (no segment flows on this org — segment shape checks skipped)')
    }
    console.log('\n   list_blueprints sample:\n' + JSON.stringify(flows.slice(0, 2), null, 2).split('\n').map((l) => '   ' + l).join('\n'))
  }

  // --- list_segments (D4 + D5 + [11]) ---
  const segs = await call(client, 'list_segments')
  if (segs.isError) {
    check('list_segments succeeds', false, segs.text)
  } else {
    const arr = Array.isArray(segs.json) ? segs.json : []
    check('list_segments returns array', Array.isArray(segs.json), `${arr.length} segments`)
    if (arr.length > 0) {
      const s = arr[0]
      check('[11]: segment has id, not duplicate _id', 'id' in s && !('_id' in s))
      check('D4: segment has numeric priority, no order', typeof s.priority === 'number' && !('order' in s))
      check('D5: segment has filter[]', Array.isArray(s.filter))
      check('segment has enabled boolean', typeof s.enabled === 'boolean')
    } else {
      console.log('   (no segments on this org — per-segment field checks skipped)')
    }
  }

  // --- B1: error messages surface ---
  const bad = await call(client, 'get_blueprint', { blueprintId: 'deadbeefdeadbeefdeadbeef' })
  check(
    'B1: server error text surfaced (not generic)',
    bad.isError && /not found/i.test(bad.text) && !/^Churnkey API error \d+$/.test(bad.text.trim()),
    bad.text,
  )

  await client.close()
} catch (err) {
  console.error('\nSmoke run threw:', err?.message || err)
  try { await client.close() } catch {}
  process.exit(1)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${failed.length === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failed.length} CHECK(S) FAILED`} (${results.length} total)`)
process.exit(failed.length === 0 ? 0 : 1)
