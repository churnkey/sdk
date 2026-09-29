import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import { OpenAIExtensions } from '@openai/mcp-extensions/app'
import { type DashboardData, type DashboardWindow, WINDOWS } from '../../src/apps/dashboard-types'

// Churnkey Retention Dashboard — the MCP App rendered by open_retention_dashboard.
// It renders the tool result it was opened with, re-queries the same tool when
// the user changes the window or segment, and uses the OpenAI extensions to
// hand the model what the user is looking at (model context) or ask it a
// question (ui/message).

const TOOL = 'open_retention_dashboard'
const WINDOW_LABEL: Record<DashboardWindow, string> = { '30d': '30 days', '90d': '90 days', '12m': '12 months' }

const app = new App({ name: 'churnkey-retention-dashboard', version: '1.0.0' })
const openai = new OpenAIExtensions(app)
const root = document.getElementById('root') as HTMLElement

let data: DashboardData | null = null
let loading = false

// ---------- formatting ----------

const esc = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
const int = (n: number) => Math.round(n).toLocaleString('en-US')
const pct = (rate: number | null | undefined) => (rate == null ? '—' : `${(rate * 100).toFixed(1)}%`)
const usd = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const offerLabel = (type: string) => type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ')
const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
}

// ---------- rendering ----------

function render(): void {
  if (!data) return
  const d = data
  const m = d.metrics
  const selected = d.segmentId ? d.segments.find((s) => s.id === d.segmentId) : undefined
  const scopeName = selected?.name ?? (d.segmentId ? `Segment ${d.segmentId}` : 'All cancel flows')
  const outcomes = m.sessionOutcomes
  const total = Math.max(1, outcomes.saved.total + outcomes.canceled + outcomes.abandoned)
  const offers = Object.entries(outcomes.saved.byOfferType).sort(([, a], [, b]) => b - a)
  const maxOffer = Math.max(1, ...offers.map(([, n]) => n))
  const canFullscreen = app.getHostContext()?.availableDisplayModes?.includes('fullscreen')
  const isFullscreen = app.getHostContext()?.displayMode === 'fullscreen'

  root.innerHTML = `
    <header>
      <div class="title">
        <h1>${esc(d.org?.name ?? 'Churnkey')} · Retention
          <span class="pill ${d.mode === 'test' ? 'test' : ''}">${d.mode.toUpperCase()}</span></h1>
        <span class="text-muted text-small">${esc(scopeName)} · ${esc(d.startDate)} → ${esc(d.endDate)}</span>
      </div>
      <div class="controls">
        <div class="segmented" role="group" aria-label="Time window">
          ${WINDOWS.map(
            (w) =>
              `<button type="button" data-window="${w}" aria-pressed="${w === d.window}">${WINDOW_LABEL[w]}</button>`,
          ).join('')}
        </div>
        ${d.segmentId ? '<button type="button" class="btn btn-ghost" data-action="clear">All flows</button>' : ''}
        ${canAsk() ? '<button type="button" class="btn btn-primary" data-action="ask-view">Ask about this view</button>' : ''}
        ${canFullscreen && !isFullscreen ? '<button type="button" class="btn btn-ghost" data-action="fullscreen" aria-label="Open fullscreen">⤢</button>' : ''}
      </div>
    </header>

    ${m.sampleSizeWarning ? `<div class="warning">${esc(m.sampleSizeWarning)}</div>` : ''}

    <section class="kpis">
      ${kpi('Save rate', pct(m.saveRate), `${int(m.customersSaved)} of ${int(m.totalSessions)} sessions`)}
      ${kpi('Customers saved', int(m.customersSaved), `${int(outcomes.canceled)} canceled · ${int(outcomes.abandoned)} abandoned`)}
      ${kpi('Boosted revenue', usd(m.boostedRevenueUSD), m.averageBoostedRevenueUSD != null ? `${usd(m.averageBoostedRevenueUSD)} per save` : 'live mode only')}
      ${kpi('Sessions', int(m.totalSessions), WINDOW_LABEL[d.window])}
    </section>

    <section class="grid-2">
      <div class="card panel">
        <h2>Session outcomes</h2>
        <div class="stack" role="img" aria-label="Saved ${pct(outcomes.saved.total / total)}, canceled ${pct(outcomes.canceled / total)}, abandoned ${pct(outcomes.abandoned / total)}">
          <span style="width:${(outcomes.saved.total / total) * 100}%;background:var(--saved)"></span>
          <span style="width:${(outcomes.canceled / total) * 100}%;background:var(--canceled)"></span>
          <span style="width:${(outcomes.abandoned / total) * 100}%;background:var(--abandoned)"></span>
        </div>
        <div class="legend">
          <span><i style="background:var(--saved)"></i>Saved ${pct(outcomes.saved.total / total)}</span>
          <span><i style="background:var(--canceled)"></i>Canceled ${pct(outcomes.canceled / total)}</span>
          <span><i style="background:var(--abandoned)"></i>Abandoned ${pct(outcomes.abandoned / total)}</span>
        </div>
        <div class="offers">
          ${
            offers.length === 0
              ? '<span class="text-muted">No saves in this window.</span>'
              : offers
                  .map(
                    ([type, n]) => `<div class="offer-row"><span>${esc(offerLabel(type))}</span>
                      <span class="bar" style="width:${(n / maxOffer) * 100}%"></span><span class="n">${int(n)}</span></div>`,
                  )
                  .join('')
          }
        </div>
      </div>
      <div class="card panel">
        <h2>Monthly trend</h2>
        ${trendChart(d.trend)}
        <div class="legend">
          <span><i style="background:var(--saved)"></i>Saved</span>
          <span><i style="background:var(--canceled)"></i>Canceled</span>
          <span><i style="background:var(--abandoned)"></i>Abandoned</span>
        </div>
      </div>
    </section>

    <section class="card panel">
      <h2>Segments</h2>
      ${segmentTable(d)}
    </section>

    <p class="footer">Churnkey analytics warehouse (~3h refresh). Select a segment to scope the view and share it with the assistant.</p>
  `
}

function kpi(label: string, value: string, sub: string): string {
  return `<div class="card kpi"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span><span class="sub">${esc(sub)}</span></div>`
}

function trendChart(trend: DashboardData['trend']): string {
  if (trend.length === 0) return '<span class="text-muted">No sessions in this window.</span>'
  // Horizontal positions are percentages and vertical ones pixels, with no
  // viewBox: a stretched viewBox (preserveAspectRatio="none") distorted the
  // labels, squashing them to illegible slivers at 12 months.
  const height = 150
  const max = Math.max(1, ...trend.map((t) => t.saved + t.canceled + t.abandoned))
  const slot = 100 / trend.length
  const barW = slot * 0.56
  const dense = trend.length > 8
  const bars = trend
    .map((t, i) => {
      const x = i * slot + (slot - barW) / 2
      const cx = `${x + barW / 2}%`
      let y = height
      const seg = (n: number, color: string) => {
        const h = (n / max) * (height - 16)
        y -= h
        return `<rect x="${x}%" y="${y}" width="${barW}%" height="${h}" fill="${color}" rx="2"><title>${int(n)}</title></rect>`
      }
      const rate = t.saved / Math.max(1, t.saved + t.canceled + t.abandoned)
      return `${seg(t.saved, 'var(--saved)')}${seg(t.canceled, 'var(--canceled)')}${seg(t.abandoned, 'var(--abandoned)')}
        <text x="${cx}" y="${y - 4}" text-anchor="middle">${dense ? `${Math.round(rate * 100)}%` : pct(rate)}</text>
        <text x="${cx}" y="${height + 14}" text-anchor="middle">${esc(monthLabel(t.month))}</text>`
    })
    .join('')
  return `<svg class="trend${dense ? ' dense' : ''}" height="${height + 18}" role="img" aria-label="Monthly sessions by outcome">${bars}</svg>`
}

function segmentTable(d: DashboardData): string {
  if (d.segments.length === 0) return '<span class="text-muted">No segment flows in this workspace.</span>'
  const rows = d.segments
    .map(
      (s) => `<tr data-segment="${esc(s.id)}" aria-selected="${s.id === d.segmentId}">
        <td>${esc(s.name)}${s.enabled ? '' : ' <span class="pill">OFF</span>'}</td>
        <td class="num">${int(s.total)}</td>
        <td class="num">${int(s.saved)}</td>
        <td class="num"><span class="rate">${pct(s.saveRate)}<span class="mini"><span style="width:${(s.saveRate ?? 0) * 100}%"></span></span></span></td>
        <td class="num">${canAsk() ? `<button type="button" class="btn btn-ghost ask" data-ask="${esc(s.id)}">Ask</button>` : ''}</td>
      </tr>`,
    )
    .join('')
  return `<div class="table-wrap"><table>
    <thead><tr><th>Segment</th><th class="num">Sessions</th><th class="num">Saved</th><th class="num">Save rate</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`
}

function renderError(message: string): void {
  root.innerHTML = `<p class="error">${esc(message)}</p>`
}

// ---------- data + model context ----------

function viewSummary(d: DashboardData): string {
  const selected = d.segmentId ? d.segments.find((s) => s.id === d.segmentId) : undefined
  return [
    `The user is viewing the Churnkey Retention Dashboard for ${d.org?.name ?? 'their workspace'} (${d.mode} mode), ${d.startDate} to ${d.endDate}, scoped to ${selected ? `the "${selected.name}" segment (segmentId ${selected.id})` : 'all cancel flows'}.`,
    d.metrics.summary,
  ].join(' ')
}

// The OpenAI extensions are preferred where the host advertises them (titled
// composer chips, hidden background context). Any other MCP Apps host that
// supports the standard ui/update-model-context and ui/message (Claude, for
// one) gets the same content through the base App API instead.
const hostCaps = () => app.getHostCapabilities()
const canAsk = () => openai.message != null || hostCaps()?.message != null

async function shareContext(d: DashboardData): Promise<void> {
  const modelContext = openai.modelContext
  if (!modelContext && hostCaps()?.updateModelContext == null) return
  const selected = d.segmentId ? d.segments.find((s) => s.id === d.segmentId) : undefined
  const content: Parameters<typeof app.updateModelContext>[0]['content'] = [
    // What's on screen, for the model only — no composer chip.
    { type: 'text', text: viewSummary(d), annotations: { audience: ['assistant'] } },
  ]
  if (selected) {
    // A user-visible, removable attachment for the segment they picked.
    content.push({
      type: 'text',
      text: `Segment "${selected.name}" (segmentId ${selected.id}): ${selected.total} sessions, ${selected.saved} saved (${pct(selected.saveRate)}), ${selected.canceled} canceled, ${selected.abandoned} abandoned between ${d.startDate} and ${d.endDate}.`,
      _meta: { 'openai/title': `Segment: ${selected.name}` },
    })
  }
  const params = { content, structuredContent: { window: d.window, segmentId: d.segmentId, startDate: d.startDate } }
  await (modelContext ? modelContext.update(params) : app.updateModelContext(params)).catch(() => undefined)
}

async function reload(args: { window?: DashboardWindow; segmentId?: string | null }): Promise<void> {
  if (loading || !data) return
  loading = true
  root.style.opacity = '0.55'
  try {
    const segmentId = args.segmentId === undefined ? data.segmentId : args.segmentId
    const result = await app.callServerTool({
      name: TOOL,
      arguments: { window: args.window ?? data.window, ...(segmentId ? { segmentId } : {}) },
    })
    if (result.isError) throw new Error(textOf(result.content) || 'Could not load retention data.')
    data = result.structuredContent as unknown as DashboardData
    render()
    await shareContext(data)
  } catch (err) {
    renderError(err instanceof Error ? err.message : String(err))
  } finally {
    loading = false
    root.style.opacity = ''
  }
}

function textOf(content: unknown): string {
  return Array.isArray(content)
    ? content
        .filter((c) => c?.type === 'text')
        .map((c) => c.text)
        .join('\n')
    : ''
}

async function ask(text: string, attachment?: { title: string; text: string }): Promise<void> {
  const message = openai.message
  if (message) {
    const content: Parameters<typeof message.send>[0]['content'] = [{ type: 'text', text }]
    if (attachment) content.push({ type: 'text', text: attachment.text, _meta: { 'openai/title': attachment.title } })
    await message.send({ role: 'user', content }).catch(() => undefined)
    return
  }
  if (hostCaps()?.message == null) return
  // Without titled attachments the numbers go inline, so the message still
  // reads as one question.
  const body = attachment ? `${text}\n\n${attachment.text}` : text
  await app.sendMessage({ role: 'user', content: [{ type: 'text', text: body }] }).catch(() => undefined)
}

// ---------- events ----------

root.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const d = data
  if (!d) return

  const windowButton = target.closest<HTMLElement>('[data-window]')
  if (windowButton) {
    void reload({ window: windowButton.dataset.window as DashboardWindow })
    return
  }

  const askButton = target.closest<HTMLElement>('[data-ask]')
  if (askButton) {
    const s = d.segments.find((row) => row.id === askButton.dataset.ask)
    if (s) {
      void ask(
        `Why does the "${s.name}" segment save ${pct(s.saveRate)} of customers, and what offer change or A/B test would you try to raise it?`,
        {
          title: `Segment: ${s.name}`,
          text: `Segment "${s.name}" (segmentId ${s.id}), ${d.startDate} to ${d.endDate}: ${s.total} sessions, ${s.saved} saved, ${s.canceled} canceled, ${s.abandoned} abandoned.`,
        },
      )
    }
    return
  }

  const row = target.closest<HTMLElement>('[data-segment]')
  if (row) {
    const id = row.dataset.segment as string
    void reload({ segmentId: id === d.segmentId ? null : id })
    return
  }

  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
  if (action === 'clear') void reload({ segmentId: null })
  if (action === 'fullscreen') void app.requestDisplayMode({ mode: 'fullscreen' }).catch(() => undefined)
  if (action === 'ask-view') {
    void ask('Summarize what stands out in this retention view and suggest the single most valuable next step.', {
      title: 'Retention view',
      text: viewSummary(d),
    })
  }
})

// Deep links: /segments/<id>?window=30d opens the dashboard on that segment.
function applyDeepLink(): void {
  const link = openai.deepLink.getCurrent()
  if (!link || !data) return
  const url = new URL(link.url, 'https://app.invalid')
  const segment = url.pathname.match(/^\/segments\/([^/]+)$/)?.[1]
  const window = url.searchParams.get('window') as DashboardWindow | null
  const next = {
    segmentId: segment ? decodeURIComponent(segment) : null,
    window: window && WINDOWS.includes(window) ? window : data.window,
  }
  if (next.segmentId !== data.segmentId || next.window !== data.window) void reload(next)
}

function applyHostContext(): void {
  const context = app.getHostContext()
  if (context?.theme) applyDocumentTheme(context.theme)
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables)
  if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts)
}

app.ontoolresult = (result) => {
  if (result.isError) {
    renderError(textOf(result.content) || 'Could not load retention data.')
    return
  }
  data = result.structuredContent as unknown as DashboardData
  render()
  void shareContext(data)
  applyDeepLink()
}

app.addEventListener('hostcontextchanged', () => {
  applyHostContext()
  applyDeepLink()
  render()
})

// Handlers above are registered before connecting so the initial tool result
// renders directly instead of triggering a second call.
app
  .connect()
  .then(applyHostContext)
  .catch((err) => renderError(`Could not connect to the host: ${err instanceof Error ? err.message : String(err)}`))
