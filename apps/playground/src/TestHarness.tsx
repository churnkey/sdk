import { CancelFlow } from '@churnkey/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@churnkey/react/styles.css'
import type {
  AcceptedOffer,
  Appearance,
  CustomOfferProps,
  CustomStepProps,
  DirectCustomer,
  DirectSubscription,
  Step,
} from '@churnkey/react/core'

type Scenario =
  | 'open-source'
  | 'analytics-basic'
  | 'analytics-full'
  | 'token'
  | 'token-analytics'
  | 'steps-merge'
  | 'custom-steps'
  | 'all-offers'
  | 'standalone-offer'
  | 'themes'

const SCENARIOS: { id: Scenario; label: string; description: string }[] = [
  {
    id: 'open-source',
    label: 'Open Source',
    description: 'No Churnkey. Steps in code, callbacks handle billing. No network calls.',
  },
  {
    id: 'analytics-basic',
    label: 'Analytics (minimal)',
    description: 'appId + customer ID only. Session recorded to /api/sessions/sdk.',
  },
  {
    id: 'analytics-full',
    label: 'Analytics (with subscription)',
    description: 'appId + customer + subscription data. Full session with plan/price/interval.',
  },
  { id: 'token', label: 'Token Mode', description: 'Session token. Config from API, billing actions via Churnkey.' },
  {
    id: 'token-analytics',
    label: 'Token + Direct Customer Data',
    description:
      'Token + customer/subscriptions. Session payload enriched with client-side data (metadata, plan price).',
  },
  {
    id: 'steps-merge',
    label: 'Steps + Session Merge',
    description: 'Token provides base config, local steps override confirm title and add custom NPS step.',
  },
  {
    id: 'custom-steps',
    label: 'Custom Steps + Analytics',
    description: 'Custom NPS step and change-seats offer, with analytics recording.',
  },
  {
    id: 'all-offers',
    label: 'All Built-in Offer Types',
    description: 'discount, pause, plan_change, trial_extension, contact, redirect — one reason each.',
  },
  {
    id: 'standalone-offer',
    label: 'Standalone Offer (No Survey)',
    description: 'Flow starts on an OFFER step — proactive save offer before any survey.',
  },
  { id: 'themes', label: 'Themes + Dark Mode', description: 'Cycle through theme/colorScheme combinations.' },
]

// A customized success step on every flow catches regressions in the
// post-outcome transition — the renderer should pick up savedTitle /
// cancelledTitle from the graph, not fall back to defaults.
const successStep: Step = {
  type: 'success',
  savedTitle: '🎉 Saved! (custom title)',
  savedDescription: 'This custom description confirms the success step is rendering graph-config, not defaults.',
  cancelledTitle: '👋 Cancelled (custom title)',
  cancelledDescription: 'If you see this, the cancelled outcome is rendering from the declared success step.',
}

const localSteps: Step[] = [
  {
    type: 'survey',
    title: 'Why are you leaving?',
    reasons: [
      { id: 'expensive', label: 'Too expensive', offer: { type: 'discount', percent: 20, months: 3 } },
      { id: 'not-using', label: 'Not using it enough', offer: { type: 'pause', months: 2 } },
      { id: 'missing', label: 'Missing features' },
    ],
  },
  { type: 'feedback', title: 'Anything else?' },
  { type: 'confirm' },
  successStep,
]

const mergeSteps: Step[] = [
  { type: 'confirm', title: 'We really hate to see you go' },
  { type: 'nps', title: 'One quick question', data: { scale: 10 } },
]

const customSteps: Step[] = [
  {
    type: 'survey',
    title: 'Why are you cancelling?',
    reasons: [
      {
        id: 'seats',
        label: 'Too many seats',
        offer: { type: 'change-seats', data: { currentSeats: 10, minSeats: 1, pricePerSeat: 10 } },
      },
      { id: 'expensive', label: 'Too expensive', offer: { type: 'discount', percent: 20, months: 3 } },
      { id: 'missing', label: 'Missing features' },
    ],
  },
  { type: 'nps', title: 'Quick question', data: { scale: 10 } },
  { type: 'feedback' },
  { type: 'confirm' },
  successStep,
]

// One reason per built-in offer type. Exercising all defaults catches
// regressions in offer rendering, default copy, and wire payload shape.
const allOffersSteps: Step[] = [
  {
    type: 'survey',
    title: 'Pick any reason to see its offer',
    reasons: [
      { id: 'discount', label: 'Too expensive (→ discount)', offer: { type: 'discount', percent: 25, months: 3 } },
      { id: 'pause', label: 'Temporary break (→ pause)', offer: { type: 'pause', months: 2 } },
      {
        id: 'plan',
        label: 'Wrong plan (→ plan_change)',
        offer: {
          type: 'plan_change',
          plans: [
            { id: 'starter', name: 'Starter', price: 9, interval: 'month', currency: 'USD', features: ['1 user'] },
            { id: 'pro', name: 'Pro', price: 29, interval: 'month', currency: 'USD', features: ['5 users'] },
          ],
        },
      },
      { id: 'trial', label: 'Need more time (→ trial_extension)', offer: { type: 'trial_extension', days: 14 } },
      {
        id: 'contact',
        label: 'Talk to someone (→ contact)',
        offer: { type: 'contact', url: 'mailto:support@example.com', label: 'Email support' },
      },
      {
        id: 'redirect',
        label: 'Learn more (→ redirect)',
        offer: { type: 'redirect', url: 'https://example.com/docs', label: 'See docs' },
      },
      { id: 'none', label: 'No reason (no offer)' },
    ],
  },
  { type: 'feedback', title: 'Tell us more' },
  { type: 'confirm' },
  successStep,
]

// Flow starts directly on an offer step. Exercises buildInitialState's
// currentStep.offer read for the first step and the offer-first entry path.
const standaloneOfferSteps: Step[] = [
  {
    type: 'offer',
    title: 'Before you go...',
    offer: {
      type: 'discount',
      percent: 30,
      months: 6,
      copy: {
        headline: 'Stay and get 30% off',
        body: "Here's our best offer — 30% off for six months, no questions asked.",
        cta: 'Claim 30% off',
        declineCta: 'No thanks, continue',
      },
    },
  },
  { type: 'confirm' },
  successStep,
]

function usePersistedField(key: string, defaultValue = '') {
  const [value, setValue] = useState(() => localStorage.getItem(`ck_test_${key}`) ?? defaultValue)
  const set = useCallback(
    (v: string) => {
      setValue(v)
      localStorage.setItem(`ck_test_${key}`, v)
    },
    [key],
  )
  return [value, set] as const
}

function NpsStep({ step, onNext }: CustomStepProps) {
  const [score, setScore] = useState<number | null>(null)
  const scale = (step.data?.scale as number) ?? 10
  return (
    <div style={{ padding: '24px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>How likely are you to recommend us? (0-{scale})</p>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 16 }}>
        {Array.from({ length: scale + 1 }, (_, i) => (
          <button
            type="button"
            key={i}
            onClick={() => setScore(i)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              border: score === i ? '2px solid #2563eb' : '1px solid #d1d5db',
              background: score === i ? '#eff6ff' : '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {i}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onNext({ npsScore: score })}
        disabled={score === null}
        style={{
          padding: '10px 20px',
          background: score !== null ? '#2563eb' : '#93c5fd',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: score !== null ? 'pointer' : 'default',
          fontFamily: 'inherit',
        }}
      >
        Continue
      </button>
    </div>
  )
}

function SeatAdjuster({ offer, onAccept, onDecline, isProcessing }: CustomOfferProps) {
  const data = (offer as { data?: Record<string, unknown> }).data ?? {}
  const currentSeats = (data.currentSeats as number) ?? 10
  const minSeats = (data.minSeats as number) ?? 1
  const pricePerSeat = (data.pricePerSeat as number) ?? 10

  const [seats, setSeats] = useState(Math.max(minSeats, currentSeats - 1))

  const currentMonthly = currentSeats * pricePerSeat
  const newMonthly = seats * pricePerSeat
  const monthlySavings = currentMonthly - newMonthly
  const unchanged = seats === currentSeats

  const stepButton = (disabled: boolean) => ({
    width: 36,
    height: 36,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 18,
    fontFamily: 'inherit',
    opacity: disabled ? 0.4 : 1,
  })

  return (
    <div style={{ padding: '8px 0 24px', textAlign: 'center' }}>
      <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Pay for what you use</h3>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 20px' }}>
        You're on {currentSeats} seats at ${currentMonthly}/mo. Drop unused seats and keep the rest.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setSeats((s) => Math.max(minSeats, s - 1))}
          disabled={seats <= minSeats}
          style={stepButton(seats <= minSeats)}
          aria-label="Decrease seats"
        >
          −
        </button>
        <div style={{ minWidth: 72 }}>
          <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{seats}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>seat{seats === 1 ? '' : 's'}</div>
        </div>
        <button
          type="button"
          onClick={() => setSeats((s) => Math.min(currentSeats, s + 1))}
          disabled={seats >= currentSeats}
          style={stepButton(seats >= currentSeats)}
          aria-label="Increase seats"
        >
          +
        </button>
      </div>

      <div
        style={{
          background: '#f9fafb',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
        }}
      >
        <span style={{ color: '#6b7280' }}>New monthly bill</span>
        <span style={{ fontWeight: 600 }}>
          ${newMonthly}
          {monthlySavings > 0 && <span style={{ color: '#059669', marginLeft: 8 }}>(save ${monthlySavings}/mo)</span>}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onAccept({ seats, previousSeats: currentSeats, monthlyDelta: newMonthly - currentMonthly })}
        disabled={isProcessing || unchanged}
        style={{
          padding: '10px 20px',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: isProcessing || unchanged ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          opacity: isProcessing || unchanged ? 0.5 : 1,
        }}
      >
        {isProcessing ? 'Updating…' : unchanged ? 'Pick a lower seat count' : `Reduce to ${seats} seats`}
      </button>
      <button
        type="button"
        onClick={onDecline}
        style={{
          display: 'block',
          margin: '10px auto 0',
          background: 'none',
          border: 'none',
          color: '#9ca3af',
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        No thanks, cancel
      </button>
    </div>
  )
}

export function TestHarness() {
  const [appId, setAppId] = usePersistedField('appId')
  const [apiKey, setApiKey] = usePersistedField('apiKey')
  const [customerId, setCustomerId] = usePersistedField('customerId')
  const [customerEmail, setCustomerEmail] = usePersistedField('customerEmail')
  const [subscriptionId, setSubscriptionId] = usePersistedField('subscriptionId')
  const [planPriceStr, setPlanPrice] = usePersistedField('planPrice', '2999')
  const [apiBase, setApiBase] = usePersistedField('apiBase', 'http://localhost:3000/v1')
  const [scenario, setScenario] = useState<Scenario>('open-source')
  const [mode, setMode] = useState<'live' | 'test'>('test')
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<'default' | 'minimal' | 'rounded' | 'corporate'>('default')
  const [colorScheme, setColorScheme] = useState<'light' | 'dark' | 'auto'>('light')
  const logRef = useRef<HTMLDivElement>(null)
  const [logs, setLogs] = useState<string[]>([])

  const log = useCallback((msg: string) => {
    const line = `${new Date().toLocaleTimeString()}  ${msg}`
    setLogs((prev) => [...prev, line])
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 0)
  }, [])

  // Wrap fetch while the harness is mounted so we can surface SDK network
  // activity in the in-UI log panel. Only logs requests to /api/sessions.
  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const isSessionRequest = url.includes('/api/sessions')
      if (isSessionRequest) {
        log(`→ ${init?.method ?? 'GET'} ${url}`)
      }
      try {
        const res = await originalFetch(input, init)
        if (isSessionRequest) {
          log(`← ${res.status} ${url}`)
        }
        return res
      } catch (err) {
        if (isSessionRequest) {
          log(`✕ ${url} — ${err instanceof Error ? err.message : String(err)}`)
        }
        throw err
      }
    }
    return () => {
      window.fetch = originalFetch
    }
  }, [log])

  const customer: DirectCustomer | undefined =
    scenario !== 'open-source' ? { id: customerId || 'cus_test', email: customerEmail || undefined } : undefined

  const subscriptions: DirectSubscription[] | undefined =
    scenario === 'analytics-full' || scenario === 'token-analytics' || scenario === 'custom-steps'
      ? [
          {
            id: subscriptionId || 'sub_test',
            start: '2024-06-01',
            status: { name: 'active' as const, currentPeriod: { start: '2025-04-01', end: '2025-05-01' } },
            items: [
              {
                price: {
                  id: 'price_test',
                  name: 'Pro Plan',
                  amount: { value: parseInt(planPriceStr, 10) || 2999, currency: 'usd' },
                  interval: 'month' as const,
                },
              },
            ],
          },
        ]
      : undefined

  const needsToken = ['token', 'token-analytics', 'steps-merge'].includes(scenario)

  // Memoize on identity fields. Without useMemo the Date.now() in the payload
  // produces a fresh token string each render, which the SDK reads as a new
  // session and refetches /embed — resetting the flow to step 1.
  const token = useMemo(() => {
    if (!needsToken || !appId || !apiKey || !customerId) return undefined
    const payload = JSON.stringify({
      a: appId,
      c: customerId,
      s: subscriptionId || undefined,
      h: 'dev-test-hash',
      m: mode,
      t: Date.now(),
    })
    return `ck_${btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  }, [needsToken, appId, apiKey, customerId, subscriptionId, mode])

  const appearance: Appearance = scenario === 'themes' ? { theme, colorScheme } : {}

  function getSteps(): Step[] | undefined {
    switch (scenario) {
      case 'steps-merge':
        return mergeSteps
      case 'custom-steps':
        return customSteps
      case 'all-offers':
        return allOffersSteps
      case 'standalone-offer':
        return standaloneOfferSteps
      case 'token':
      case 'token-analytics':
        return undefined
      default:
        return localSteps
    }
  }

  const handleAccept = async (offer: AcceptedOffer) => {
    log(`ACCEPT: type=${offer.type} reasonId=${offer.reasonId}`)
    log(`  offer: ${JSON.stringify(offer)}`)
    await new Promise((r) => setTimeout(r, 800))
  }

  const handleCancel = async () => {
    log('CANCEL')
    await new Promise((r) => setTimeout(r, 800))
  }

  const handleStepChange = (step: string, prevStep: string) => {
    log(`step: ${prevStep} → ${step}`)
  }

  const needsAppId = scenario !== 'open-source'
  const needsApiKey = needsToken
  const needsCustomer = scenario !== 'open-source' && scenario !== 'themes'

  const missing: string[] = []
  if (needsAppId && !appId) missing.push('App ID')
  if (needsApiKey && !apiKey) missing.push('API Key')
  if (needsCustomer && !customerId) missing.push('Customer ID')
  const canLaunch = missing.length === 0

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', fontFamily: 'system-ui', padding: '0 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>SDK Test Harness</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>
        Test each integration scenario against a real or local Churnkey API.
      </p>

      {/* Credentials */}
      <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <legend style={{ fontSize: 13, fontWeight: 600, color: '#374151', padding: '0 4px' }}>Credentials</legend>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="App ID" value={appId} onChange={setAppId} placeholder="app_xxx" disabled={!needsAppId} />
          <Field
            label="API Key"
            value={apiKey}
            onChange={setApiKey}
            placeholder="sk_xxx"
            type="password"
            disabled={!needsApiKey}
          />
          <Field
            label="Customer ID"
            value={customerId}
            onChange={setCustomerId}
            placeholder="cus_xxx"
            disabled={!needsCustomer}
          />
          <Field
            label="Customer Email"
            value={customerEmail}
            onChange={setCustomerEmail}
            placeholder="jane@acme.com"
            disabled={!needsCustomer}
          />
          <Field
            label="Subscription ID"
            value={subscriptionId}
            onChange={setSubscriptionId}
            placeholder="sub_xxx"
            disabled={!needsCustomer}
          />
          <Field
            label="Plan Price (cents)"
            value={planPriceStr}
            onChange={setPlanPrice}
            placeholder="2999"
            disabled={!needsCustomer}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <Field
            label="API Base URL"
            value={apiBase}
            onChange={setApiBase}
            placeholder="http://localhost:3000/v1"
            disabled={!needsAppId}
          />
        </div>
      </fieldset>

      {/* Scenario picker */}
      <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <legend style={{ fontSize: 13, fontWeight: 600, color: '#374151', padding: '0 4px' }}>Scenario</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SCENARIOS.map((s) => (
            <label
              key={s.id}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                padding: '6px 8px',
                borderRadius: 6,
                background: scenario === s.id ? '#eff6ff' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="scenario"
                checked={scenario === s.id}
                onChange={() => setScenario(s.id)}
                style={{ marginTop: 2 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{s.description}</div>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Mode (does not apply to open-source — no session is recorded) */}
      {scenario !== 'open-source' && (
        <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, color: '#374151', padding: '0 4px' }}>Session mode</legend>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['test', 'live'] as const).map((m) => (
              <Pill key={m} label={m} selected={mode === m} onClick={() => setMode(m)} />
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 0' }}>
            Recorded as <code>mode</code> on the session. In token scenarios this is also baked into the token's{' '}
            <code>m</code> field, which would normally come from the server.
          </p>
        </fieldset>
      )}

      {/* Theme picker (themes scenario only) */}
      {scenario === 'themes' && (
        <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, color: '#374151', padding: '0 4px' }}>Theme</legend>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {(['default', 'minimal', 'rounded', 'corporate'] as const).map((t) => (
              <Pill key={t} label={t} selected={theme === t} onClick={() => setTheme(t)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['light', 'dark', 'auto'] as const).map((s) => (
              <Pill key={s} label={s} selected={colorScheme === s} onClick={() => setColorScheme(s)} />
            ))}
          </div>
        </fieldset>
      )}

      {/* Launch */}
      <button
        type="button"
        disabled={!canLaunch}
        onClick={() => {
          setOpen(true)
          log(`Opened: ${scenario}`)
          log(
            `  appId=${appId || '(none)'}  customer=${customer ? customer.id : '(none)'}  subscriptions=${subscriptions ? subscriptions.length : 0}  session=${token ? 'yes' : 'no'}  apiBase=${apiBase}`,
          )
        }}
        style={{
          width: '100%',
          padding: 12,
          background: canLaunch ? '#4f46e5' : '#c7d2fe',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: canLaunch ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
        }}
      >
        {canLaunch ? 'Launch Cancel Flow' : `Missing: ${missing.join(', ')}`}
      </button>

      {/* Log */}
      {logs.length > 0 && (
        <div
          ref={logRef}
          style={{
            marginTop: 16,
            background: '#1f2937',
            color: '#d1d5db',
            padding: 12,
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: 11,
            maxHeight: 240,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {logs.join('\n')}
        </div>
      )}
      {logs.length > 0 && (
        <button
          type="button"
          onClick={() => setLogs([])}
          style={{
            marginTop: 4,
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Clear log
        </button>
      )}

      {/* CancelFlow */}
      {open && (
        <CancelFlow
          appId={needsAppId && appId ? appId : undefined}
          customer={customer}
          subscriptions={subscriptions}
          session={token}
          mode={mode}
          apiBaseUrl={needsAppId ? apiBase : undefined}
          steps={getSteps()}
          appearance={appearance}
          customComponents={{
            nps: NpsStep,
            'change-seats': SeatAdjuster,
          }}
          onAccept={handleAccept}
          onCancel={handleCancel}
          onStepChange={handleStepChange}
          onClose={() => {
            setOpen(false)
            log('Closed')
          }}
        />
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
}) {
  return (
    <label style={{ display: 'block', opacity: disabled ? 0.4 : 1 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 2 }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '7px 10px',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </label>
  )
}

function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: selected ? 700 : 400,
        fontFamily: 'inherit',
        border: `1px solid ${selected ? '#4f46e5' : '#d1d5db'}`,
        borderRadius: 6,
        background: selected ? '#eef2ff' : '#fff',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
