import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'

const frame = document.querySelector('iframe')!
const api = async (path: string, data: unknown) => {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}
const bridge = new AppBridge(null, { name: 'Churnkey local demo host', version: '0.1.0' }, { serverTools: {}, updateModelContext: {}, message: {} }, { hostContext: { theme: 'light', displayMode: 'fullscreen' } })
bridge.oncalltool = (params) => api('/tool', params)
type DemoContext = { workspace?: { name: string }; flow?: { name: string }; metrics?: { customersSaved?: number; saveRate?: number; boostedRevenueUSD?: number }; metricsScope?: { startDate: string; endDate: string } }
let currentContext: DemoContext = {}
bridge.onupdatemodelcontext = async (params) => { currentContext = (params.structuredContent ?? {}) as DemoContext; return {} }
bridge.onmessage = async ({ content }) => {
  const log = document.getElementById('handoff')!
  log.hidden = false
  log.textContent = [
    'Selected-flow context received ✓',
    '',
    currentContext.workspace?.name ?? 'Workspace unavailable',
    'Flow: ' + (currentContext.flow?.name ?? 'Unavailable'),
    currentContext.metricsScope ? 'Window: ' + currentContext.metricsScope.startDate.slice(0,10) + ' → ' + currentContext.metricsScope.endDate.slice(0,10) : 'No live performance window',
    currentContext.metrics ? 'Customers saved: ' + currentContext.metrics.customersSaved + ' · Save rate: ' + ((currentContext.metrics.saveRate ?? 0) * 100).toFixed(1) + '%' : 'No performance data',
    '',
    'Request: review the flow and suggest one improvement. No changes or publishing.',
    '',
    'Local host received the message. No model response generated.',
  ].join('\n')
  return {}
}
bridge.oninitialized = async () => {
  await bridge.sendToolInput({ arguments: {} })
  await bridge.sendToolResult(await api('/tool', { name: 'open_flow_explorer', arguments: {} }))
}
await bridge.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!))
frame.src = '/app'
document.getElementById('open')!.onclick = () => { document.getElementById('handoff')!.hidden = true }
const mention = document.getElementById('mention') as HTMLInputElement
let generation = 0
mention.oninput = async () => {
  const request = ++generation
  const result = await api('/tool', { name: 'search_mentions', arguments: { query: mention.value } })
  if (request !== generation) return
  const target = document.getElementById('mentions')!
  target.replaceChildren()
  for (const item of result.structuredContent.items) {
    const button = document.createElement('button')
    button.textContent = item.title
    button.onclick = async () => {
      await api('/resource', { uri: item.resourceUri })
      const chip = document.createElement('span')
      chip.className = 'chip'
      chip.textContent = '@ ' + item.title
      document.getElementById('chips')!.replaceChildren(chip)
      target.replaceChildren()
      mention.value = ''
    }
    target.append(button)
  }
}
