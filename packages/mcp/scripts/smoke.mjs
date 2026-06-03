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
  const toolNames = new Set(tools.tools.map((t) => t.name))
  check('server lists tools', tools.tools.length >= 10, `${tools.tools.length} tools`)
  // New granular mutation tools must register (this exercises zod -> JSON-schema serialization).
  const NEW_TOOLS = [
    'create_blueprint',
    'create_segment_flow',
    'update_blueprint_offer',
    'edit_survey_structure',
    'add_blueprint_step',
    'remove_blueprint_step',
    'archive_segment',
    'set_segment_enabled',
    'update_segment_filter',
  ]
  const missing = NEW_TOOLS.filter((n) => !toolNames.has(n))
  check('new mutation tools registered', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : NEW_TOOLS.join(', '))

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

  // --- opt-in end-to-end WRITE round-trip (--mutate) ---
  // Creates a disposable segment flow, mutates the draft blueprint, verifies persistence by re-read,
  // exercises survey structure edits, and archives the segment for cleanup. This avoids touching the
  // org's primary draft and keeps publish as a separate manual test.
  if (process.argv.includes('--mutate')) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const created = await call(client, 'create_segment_flow', {
      segment: { name: `MCP smoke ${stamp}`, enabled: false, filter: [] },
      blueprint: { template: 'BASIC', name: `MCP smoke ${stamp}` },
      confirm: 'create_segment_flow',
    })
    check('mutate: create disposable segment flow', !created.isError && created.json?.editableBlueprintId && created.json?.segment?.id, created.text)

    const draftId = created.json?.editableBlueprintId
    const segmentId = created.json?.segment?.id
    if (draftId && segmentId) {
      const readSteps = async () => (await call(client, 'get_blueprint', { blueprintId: draftId })).json?.steps || []
      const initialSteps = await readSteps()
      const surveyStep = initialSteps.find((s) => s.survey && typeof s.survey.randomize === 'boolean')
      const pauseStep = initialSteps.find((s) => s.offer?.offerType === 'PAUSE' && typeof s.offer?.pauseConfig?.maxPauseLength === 'number')

      if (surveyStep) {
        const original = surveyStep.survey.randomize
        const w1 = await call(client, 'update_blueprint_step', {
          blueprintId: draftId,
          stepGuid: surveyStep.guid,
          updates: { survey: { randomize: !original } },
        })
        check('mutate: update_blueprint_step persisted survey.randomize', !w1.isError && (w1.json?.changedFields || []).includes('survey.randomize'), w1.text)
        const afterWrite = (await readSteps()).find((s) => s.guid === surveyStep.guid)?.survey?.randomize
        check('mutate: survey.randomize observed via re-read', afterWrite === !original, `${original} -> ${afterWrite}`)

        const add = await call(client, 'edit_survey_structure', {
          blueprintId: draftId,
          op: 'add_choice',
          stepGuid: surveyStep.guid,
          value: 'MCP smoke reason',
        })
        check('mutate: edit_survey_structure add_choice', !add.isError && (add.json?.changedFields || []).includes('survey.choices.add'), add.text)
        const addedChoice = (await readSteps())
          .find((s) => s.guid === surveyStep.guid)
          ?.survey?.choices?.find((choice) => choice.value === 'MCP smoke reason')
        const remove = addedChoice
          ? await call(client, 'edit_survey_structure', {
              blueprintId: draftId,
              op: 'remove_choice',
              stepGuid: surveyStep.guid,
              choiceGuid: addedChoice.guid,
            })
          : { isError: true, text: 'added choice not found' }
        check('mutate: edit_survey_structure remove_choice', !remove.isError, remove.text)
      } else {
        check('mutate: BASIC template includes a survey step', false, 'missing survey step')
      }

      if (pauseStep) {
        const original = pauseStep.offer.pauseConfig.maxPauseLength
        const w2 = await call(client, 'update_blueprint_offer', {
          blueprintId: draftId,
          stepGuid: pauseStep.guid,
          config: { maxPauseLength: original + 1 },
        })
        check('mutate: update_blueprint_offer pause config', !w2.isError && (w2.json?.changedFields || []).includes('config.maxPauseLength'), w2.text)
        const afterOffer = (await readSteps()).find((s) => s.guid === pauseStep.guid)?.offer?.pauseConfig?.maxPauseLength
        check('mutate: pause config observed via re-read', afterOffer === original + 1, `${original} -> ${afterOffer}`)

        const w3 = await call(client, 'update_blueprint_offer', {
          blueprintId: draftId,
          stepGuid: pauseStep.guid,
          offerType: 'REBATE',
          config: { amountType: 'PERCENT', percentAmount: 25, mbgWindowDays: 30, invoiceScope: 'LATEST_PAID' },
        })
        check(
          'mutate: update_blueprint_offer rebate config',
          !w3.isError && (w3.json?.changedFields || []).includes('offerType') && (w3.json?.changedFields || []).includes('config.percentAmount'),
          w3.text,
        )
        const rebateOffer = (await readSteps()).find((s) => s.guid === pauseStep.guid)?.offer
        check(
          'mutate: rebate config observed via re-read',
          rebateOffer?.offerType === 'REBATE' && rebateOffer?.rebateConfig?.percentAmount === 25,
          JSON.stringify(rebateOffer),
        )
      } else {
        check('mutate: BASIC template includes a pause offer step', false, 'missing pause offer step')
      }

      const archived = await call(client, 'archive_segment', { segmentId, confirm: 'archive_segment' })
      check('mutate: archive disposable segment', !archived.isError && archived.json?.id === segmentId, archived.text)
    }
  }

  await client.close()
} catch (err) {
  console.error('\nSmoke run threw:', err?.message || err)
  try { await client.close() } catch {}
  process.exit(1)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${failed.length === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failed.length} CHECK(S) FAILED`} (${results.length} total)`)
process.exit(failed.length === 0 ? 0 : 1)
