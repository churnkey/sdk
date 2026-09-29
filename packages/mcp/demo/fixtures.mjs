// Entirely synthetic data for recording. No real credentials or customer records.
export const flows = [
  { flowId: 'org', scope: 'org', name: 'Default cancel flow', status: 'active', published: true, hasUnpublishedChanges: false, editableBlueprintId: 'draft-default', publishedBlueprintId: 'published-default' },
  { flowId: 'annual', scope: 'segment', name: 'Annual subscribers', status: 'active', published: true, hasUnpublishedChanges: true, editableBlueprintId: 'draft-annual', publishedBlueprintId: 'published-annual' },
  { flowId: 'starter', scope: 'segment', name: 'Starter plan', status: 'active', published: true, hasUnpublishedChanges: false, editableBlueprintId: 'draft-starter', publishedBlueprintId: 'published-starter' },
  { flowId: 'trial', scope: 'segment', name: 'Trial customers', status: 'setup_pending', published: false, hasUnpublishedChanges: false, editableBlueprintId: 'draft-trial', publishedBlueprintId: null },
]
export function fixture(url) {
  if (url.pathname.endsWith('/account')) return { org: { id: 'synthetic-workspace', name: 'Acme SaaS · demo workspace' }, mode: 'LIVE' }
  if (url.pathname.endsWith('/blueprints')) return { flows }
  if (url.pathname.endsWith('/flow-metrics')) {
    const annual = url.searchParams.get('blueprintId') === 'published-annual'
    const small = url.searchParams.get('blueprintId') === 'published-starter'
    const seven = Date.parse(url.searchParams.get('endDate')) - Date.parse(url.searchParams.get('startDate')) < 8 * 86400000
    const data = small ? [18, 5, 690] : annual ? [384, 169, 28940] : [1268, 431, 47280]
    const factor = seven ? .25 : 1
    const totalSessions = Math.round(data[0] * factor)
    const customersSaved = Math.round(data[1] * factor)
    return { totalSessions, customersSaved, saveRate: customersSaved / totalSessions, boostedRevenueUSD: Math.round(data[2] * factor), sampleSizeWarning: totalSessions < 30 ? `Only ${totalSessions} sessions in this window — treat rates as directional, not significant (need >= 30).` : null, summary: 'Synthetic demo metrics. Not production results.' }
  }
  if (url.pathname.includes('/blueprints/')) {
    const annual = url.pathname.endsWith('published-annual')
    return { steps: [
      { stepType: 'SURVEY', enabled: true, header: 'What made you consider leaving?', description: 'Understand price, product fit, and timing before making an offer.' },
      { stepType: 'OFFER', enabled: true, header: annual ? 'Keep your annual savings' : 'Give us another try', offer: { offerType: 'DISCOUNT', description: annual ? 'Stay on your annual plan with 20% off your next renewal.' : 'Take 20% off for the next three months.' } },
      { stepType: 'OFFER', enabled: true, header: 'Need a little breathing room?', offer: { offerType: 'PAUSE', description: 'Pause your subscription for up to two months.' } },
      { stepType: 'CONFIRM', enabled: true, header: 'Confirm cancellation', description: 'A clear final decision, with no unexpected billing changes.' },
    ] }
  }
  return undefined
}
