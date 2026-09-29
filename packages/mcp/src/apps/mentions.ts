import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ChurnkeyClient } from '../client'

// Composer at-mentions (OpenAI plugin extension): typing "@" in ChatGPT lists
// this workspace's segments and A/B tests, and the picked item lands in the
// prompt as a `churnkey://` resource link the model can read. The tool is
// app-visible only, so it never shows up in the model's tool list.
//
// Spec: https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#composer-at-mentions

export const MENTIONS_TOOL = 'search_mentions'
const MAX_RESULTS = 20

interface Segment {
  id: string
  name: string
  enabled: boolean
  priority: number
}

interface AbTest {
  id: string
  name?: string
  state?: string
  hypothesis?: string | null
}

type MentionKind = 'segments' | 'ab-tests'

interface MentionItem {
  type: 'resource_link'
  uri: string
  name: string
  title: string
  description: string
  mimeType: 'application/json'
}

export function mentionUri(kind: MentionKind, id: string): string {
  return `churnkey://${kind}/${encodeURIComponent(id)}`
}

async function listSegments(client: ChurnkeyClient): Promise<Segment[]> {
  const segments = await client.get<Segment[]>('/data/segments')
  return Array.isArray(segments) ? segments : []
}

async function listAbTests(client: ChurnkeyClient): Promise<AbTest[]> {
  const tests = await client.get<AbTest[]>('/data/ab-tests')
  return Array.isArray(tests) ? tests : []
}

export async function searchMentions(client: ChurnkeyClient, query: string): Promise<MentionItem[]> {
  const needle = query.trim().toLowerCase()
  const matches = (name: string) => needle === '' || name.toLowerCase().includes(needle)
  // A token without A/B test read scope should still get segment suggestions,
  // so each list fails independently rather than emptying the picker.
  const [segmentsResult, testsResult] = await Promise.allSettled([listSegments(client), listAbTests(client)])
  const segments = segmentsResult.status === 'fulfilled' ? segmentsResult.value : []
  const tests = testsResult.status === 'fulfilled' ? testsResult.value : []

  const items: MentionItem[] = []
  for (const s of segments) {
    if (!matches(s.name)) continue
    items.push({
      type: 'resource_link',
      uri: mentionUri('segments', s.id),
      name: s.name,
      title: s.name,
      description: `Segment flow · ${s.enabled ? 'enabled' : 'disabled'} · priority ${s.priority + 1}`,
      mimeType: 'application/json',
    })
  }
  for (const t of tests) {
    const name = t.name || `A/B test ${t.id}`
    if (!matches(name)) continue
    items.push({
      type: 'resource_link',
      uri: mentionUri('ab-tests', t.id),
      name,
      title: name,
      description: `A/B test · ${t.state ?? 'unknown state'}`,
      mimeType: 'application/json',
    })
  }
  return items.slice(0, MAX_RESULTS)
}

async function readMention(client: ChurnkeyClient, kind: string, id: string): Promise<unknown> {
  if (kind === 'segments') {
    const segment = (await listSegments(client)).find((s) => s.id === id)
    if (!segment) throw new Error(`Segment ${id} not found in this workspace.`)
    return {
      kind: 'segment',
      ...segment,
      hint: 'Pass this id as segmentId to get_flow_metrics or aggregate_sessions, or open_retention_dashboard to chart it.',
    }
  }
  if (kind === 'ab-tests') {
    const test = (await listAbTests(client)).find((t) => t.id === id)
    if (!test) throw new Error(`A/B test ${id} not found in this workspace.`)
    return { kind: 'ab_test', ...test, hint: 'Call get_ab_test_metrics with this id for live results.' }
  }
  throw new Error(`Unknown Churnkey resource kind: ${kind}`)
}

export function registerMentions(server: McpServer, client: ChurnkeyClient): void {
  server.registerTool(
    MENTIONS_TOOL,
    {
      title: 'Search Churnkey mentions',
      description: 'Typeahead search over this workspace’s segments and A/B tests for composer @-mentions.',
      inputSchema: { query: z.string().describe('Search text; may be empty.') },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      _meta: {
        'openai/extensions': { 'mentions/search': {} },
        ui: { visibility: ['app'] },
      },
    },
    async ({ query }) => {
      const items = await searchMentions(client, query ?? '')
      return { content: [], structuredContent: { items } }
    },
  )

  server.registerResource(
    'churnkey-entity',
    new ResourceTemplate('churnkey://{kind}/{id}', { list: undefined }),
    { title: 'Churnkey segment or A/B test', mimeType: 'application/json' },
    async (uri, { kind, id }) => {
      const entity = await readMention(client, String(kind), decodeURIComponent(String(id)))
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(entity, null, 2) }],
      }
    },
  )
}
