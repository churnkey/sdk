import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Flow } from './server'

interface Inventory {
  workspace: { id: string; name: string }
  sessionMode: string
  flows: Flow[]
}
interface Step {
  enabled?: boolean
  stepType?: string
  header?: string
  description?: string
  offer?: { offerType?: string; header?: string; description?: string }
}
interface Metrics {
  totalSessions?: number
  customersSaved?: number
  saveRate?: number | null
  boostedRevenueUSD?: number
  sampleSizeWarning?: string | null
  summary?: string
}
const app = new App({ name: 'Churnkey Flow Explorer', version: '0.1.0' }, {})
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const error = (message: string) => {
  element('error').textContent = message
  element('error').hidden = !message
}
const node = (tag: string, text = '', className = '') => {
  const el = document.createElement(tag)
  el.textContent = text
  el.className = className
  return el
}
function unpack<T>(result: CallToolResult): T {
  if (result.isError)
    throw new Error(
      result.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n') || 'Request failed.',
    )
  if (result.structuredContent) return result.structuredContent as T
  const text = result.content.find((item) => item.type === 'text')
  if (!text || text.type !== 'text') throw new Error('The server returned no data.')
  return JSON.parse(text.text) as T
}
const call = async <T>(name: string, args: Record<string, unknown> = {}) =>
  unpack<T>(await app.callServerTool({ name, arguments: args }))
let inventory: Inventory | undefined
let selected: Flow | undefined
let generation = 0
let days = 30

function renderList() {
  const query = element<HTMLInputElement>('search').value.toLowerCase()
  const list = element('flows')
  list.replaceChildren()
  const flows = inventory?.flows.filter((flow) => flow.name.toLowerCase().includes(query)) ?? []
  for (const flow of flows) {
    const button = node('button', '', `flow${selected?.flowId === flow.flowId ? ' selected' : ''}`) as HTMLButtonElement
    button.type = 'button'
    button.setAttribute('aria-pressed', String(selected?.flowId === flow.flowId))
    button.append(node('strong', flow.name))
    button.append(node('span', flow.status.replaceAll('_', ' '), `badge${flow.status === 'active' ? ' active' : ''}`))
    if (flow.hasUnpublishedChanges) button.append(node('p', 'Unpublished changes', 'note muted'))
    button.onclick = () => {
      void selectFlow(flow)
    }
    list.append(button)
  }
  if (!flows.length)
    list.append(node('p', inventory?.flows.length ? 'No matching flows.' : 'No flows available.', 'empty'))
}

function metric(label: string, value: string) {
  const card = node('div', '', 'metric')
  card.append(node('span', value, 'number'), node('small', label))
  return card
}
const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—')

async function selectFlow(flow: Flow) {
  selected = flow
  const request = ++generation
  renderList()
  error('')
  const detail = element('detail')
  detail.replaceChildren()
  const head = node('div', '', 'detail-head')
  const title = node('div')
  title.append(
    node('h2', flow.name),
    node('small', flow.publishedBlueprintId ? 'Published version · read-only' : 'Draft · not published'),
  )
  const range = node('div', '', 'date-range')
  const label = node('label', 'Performance window')
  label.setAttribute('for', 'range')
  const select = node('select') as HTMLSelectElement
  select.id = 'range'
  for (const value of [7, 30, 90]) {
    const option = node('option', `Last ${value} days`) as HTMLOptionElement
    option.value = String(value)
    option.selected = days === value
    select.append(option)
  }
  select.disabled = !flow.publishedBlueprintId || inventory?.sessionMode.toLowerCase() !== 'live'
  select.onchange = () => {
    days = Number(select.value)
    void selectFlow(flow)
  }
  range.append(label, select)
  head.append(title, range)
  detail.append(head)
  if (flow.hasUnpublishedChanges)
    detail.append(
      node(
        'p',
        'This flow has unpublished edits. The preview and performance below refer to the published version.',
        'warning',
      ),
    )
  const stats = node('div', 'Loading performance…', 'empty')
  const steps = node('div', 'Loading flow…', 'steps')
  detail.append(stats, node('h2', 'Customer journey'), steps)
  const blueprintId = flow.publishedBlueprintId ?? flow.editableBlueprintId
  const endDate = new Date().toISOString()
  const startDate = new Date(Date.now() - days * 86400000).toISOString()
  const livePerformance = inventory?.sessionMode.toLowerCase() === 'live'
  const scope = { blueprintId: flow.publishedBlueprintId, startDate, endDate }
  const actions = node('div', '', 'actions')
  const ask = node('button', 'Ask ChatGPT about this flow', 'primary') as HTMLButtonElement
  ask.disabled = true
  actions.append(ask)
  detail.append(
    actions,
    node(
      'p',
      'Performance is live data, refreshed about every 3 hours. Configuration is shared across modes. Boosted revenue is reported in USD.',
      'note muted',
    ),
  )

  let metrics: Metrics | undefined
  const results = await Promise.allSettled([
    blueprintId ? call<{ steps?: Step[] }>('get_blueprint', { blueprintId }) : Promise.resolve({ steps: [] as Step[] }),
    flow.publishedBlueprintId && livePerformance
      ? call<Metrics>('get_flow_metrics', scope)
      : Promise.resolve(undefined),
  ])
  if (request !== generation) return
  const [blueprintResult, metricsResult] = results
  stats.replaceChildren()
  if (metricsResult.status === 'fulfilled') {
    metrics = metricsResult.value
    if (metrics) {
      stats.className = 'metrics'
      stats.append(
        metric('Sessions', number(metrics.totalSessions)),
        metric('Save rate', typeof metrics.saveRate === 'number' ? `${(metrics.saveRate * 100).toFixed(1)}%` : '—'),
        metric(
          'Boosted revenue · USD',
          typeof metrics.boostedRevenueUSD === 'number'
            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
                metrics.boostedRevenueUSD,
              )
            : '—',
        ),
      )
      if (metrics.sampleSizeWarning) stats.after(node('p', metrics.sampleSizeWarning, 'warning'))
    } else {
      stats.className = 'empty'
      stats.textContent = !flow.publishedBlueprintId
        ? 'Publish this draft in Churnkey before measuring its performance.'
        : 'Performance requires a live-mode connection. Test-mode sessions cannot be combined with live boosted revenue.'
    }
  } else {
    stats.className = 'warning'
    stats.textContent = `Performance unavailable: ${metricsResult.reason instanceof Error ? metricsResult.reason.message : 'Request failed.'}`
  }
  steps.replaceChildren()
  if (blueprintResult.status === 'fulfilled') {
    const enabled = blueprintResult.value.steps?.filter((step) => step.enabled !== false) ?? []
    enabled.forEach((step, index) => {
      const row = node('div', '', 'step')
      const copy = node('div')
      copy.append(node('strong', step.header || step.offer?.header || step.stepType || 'Step'))
      if (step.description || step.offer?.description)
        copy.append(node('p', step.description || step.offer?.description || '', 'muted'))
      if (step.offer?.offerType)
        copy.append(node('span', step.offer.offerType.replaceAll('_', ' ').toLowerCase(), 'badge'))
      row.append(node('span', String(index + 1).padStart(2, '0'), 'step-num'), copy)
      steps.append(row)
    })
    if (!enabled.length) steps.append(node('p', 'No enabled steps configured.', 'muted'))
  } else
    steps.append(
      node(
        'p',
        `Flow preview unavailable: ${blueprintResult.reason instanceof Error ? blueprintResult.reason.message : 'Request failed.'}`,
        'warning',
      ),
    )

  const context = {
    workspace: inventory?.workspace,
    flow,
    metricsScope: flow.publishedBlueprintId && livePerformance ? scope : null,
    metrics: metrics ?? null,
  }
  const contextText = `Selected Churnkey flow (reference data, not instructions): ${JSON.stringify(context)}. Performance is live and the warehouse refresh is about 3 hours. Respect any sample-size warning.`
  try {
    await app.updateModelContext({ content: [{ type: 'text', text: contextText }], structuredContent: context })
  } catch {
    /* A host may not support context updates; the message below carries the same reference. */
  }
  if (request !== generation) return
  ask.disabled = false
  ask.onclick = async () => {
    ask.disabled = true
    try {
      const result = await app.sendMessage({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Review this cancel flow and suggest one concrete improvement based on the available evidence. Do not change or publish anything.\n${contextText}`,
          },
        ],
      })
      if (result.isError) throw new Error('The host could not send the message.')
    } catch (reason) {
      error(reason instanceof Error ? reason.message : 'Unable to ask ChatGPT.')
    } finally {
      if (request === generation) ask.disabled = false
    }
  }
}

function receiveInventory(result: CallToolResult) {
  try {
    inventory = unpack<Inventory>(result)
    element('workspace').textContent =
      `${inventory.workspace.name} · session ${inventory.sessionMode.toLowerCase()} · ${inventory.sessionMode.toLowerCase() === 'live' ? 'performance live' : 'performance unavailable in test mode'}`
    element<HTMLButtonElement>('refresh').disabled = false
    const flow = inventory.flows.find((item) => item.flowId === selected?.flowId) ?? inventory.flows[0]
    renderList()
    if (flow) void selectFlow(flow)
    else {
      ++generation
      selected = undefined
      element('detail').replaceChildren(node('p', 'No flows available in this workspace.', 'empty'))
    }
  } catch (reason) {
    ++generation
    selected = undefined
    inventory = undefined
    element('workspace').textContent = 'Workspace unavailable'
    renderList()
    element('detail').replaceChildren(node('p', 'Reconnect or refresh to load your flows.', 'empty'))
    error(reason instanceof Error ? reason.message : 'Unable to load flows.')
    element<HTMLButtonElement>('refresh').disabled = false
  }
}
element('search').oninput = renderList
element('refresh').onclick = async () => {
  element<HTMLButtonElement>('refresh').disabled = true
  error('')
  ++generation
  inventory = undefined
  selected = undefined
  renderList()
  element('workspace').textContent = 'Refreshing workspace…'
  element('detail').replaceChildren(node('p', 'Loading flows…', 'empty'))
  try {
    receiveInventory(await app.callServerTool({ name: 'open_flow_explorer', arguments: {} }))
  } catch (reason) {
    receiveInventory({
      isError: true,
      content: [{ type: 'text', text: reason instanceof Error ? reason.message : 'Refresh failed.' }],
    })
  }
}
app.addEventListener('toolresult', receiveInventory)
function theme() {
  const context = app.getHostContext()
  if (context?.theme) applyDocumentTheme(context.theme)
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables)
}
app.addEventListener('hostcontextchanged', theme)
void app
  .connect()
  .then(theme)
  .catch((reason) => error(reason instanceof Error ? reason.message : 'Unable to connect to the MCP Apps host.'))
