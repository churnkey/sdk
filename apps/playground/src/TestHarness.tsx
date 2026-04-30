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
  | 'color-scheme'

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
      'Token + customer/subscriptions in Direct shape. Server skips provider lookup (uses Direct body) and session payload is enriched with client-side data (metadata, plan price).',
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
  {
    id: 'color-scheme',
    label: 'Color Scheme',
    description: 'Toggle light / dark / auto. `auto` follows OS preference.',
  },
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
    description: 'Your feedback helps us improve.',
    reasons: [
      { id: 'expensive', label: 'Too expensive', offer: { type: 'discount', percentOff: 20, durationInMonths: 3 } },
      { id: 'not-using', label: 'Not using it enough', offer: { type: 'pause', months: 2 } },
      { id: 'missing', label: 'Missing features' },
      { id: 'other', label: 'Something else' },
    ],
  },
  {
    type: 'feedback',
    title: 'What could we have done better?',
    description: 'Even one sentence helps us improve.',
    placeholder: 'Tell us what was missing…',
    required: true,
    minLength: 20,
  },
  {
    type: 'confirm',
    title: 'Confirm cancellation',
    description: 'Your access continues until the end of your billing period.',
    confirmLabel: 'Yes, cancel my subscription',
    goBackLabel: 'Never mind, take me back',
  },
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
      { id: 'expensive', label: 'Too expensive', offer: { type: 'discount', percentOff: 20, durationInMonths: 3 } },
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
      {
        id: 'discount',
        label: 'Too expensive (→ discount)',
        offer: { type: 'discount', percentOff: 25, durationInMonths: 3 },
      },
      { id: 'pause', label: 'Temporary break (→ pause)', offer: { type: 'pause', months: 2 } },
      {
        id: 'plan',
        label: 'Wrong plan (→ plan_change)',
        offer: {
          type: 'plan_change',
          plans: [
            {
              id: 'starter',
              name: 'Starter',
              amount: { value: 900, currency: 'USD' },
              duration: { interval: 'month' },
              tagline: 'For solo users',
              features: ['1 user', '5 projects', 'Email support'],
            },
            {
              id: 'pro',
              name: 'Pro',
              amount: { value: 2900, currency: 'USD' },
              duration: { interval: 'month' },
              tagline: 'Most popular',
              features: ['5 users', 'Unlimited projects', 'Priority support', 'Advanced analytics'],
              msrp: '$49/mo',
            },
          ],
        },
      },
      {
        id: 'amount-discount',
        label: 'Just need it cheaper (→ $-off discount)',
        offer: { type: 'discount', amountOff: 1000, currency: 'USD', durationInMonths: 3 },
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
  {
    type: 'feedback',
    title: 'Tell us more',
    description: 'At least 20 characters helps the team triage faster.',
    placeholder: 'What happened?',
    required: true,
    minLength: 20,
  },
  { type: 'confirm', confirmLabel: 'Cancel anyway', goBackLabel: 'Wait, take me back' },
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
      percentOff: 30,
      durationInMonths: 6,
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

// NPS custom step using a 0–10 numeric scale. Built with the SDK's CSS
// variables so it picks up `appearance.variables` overrides like every
// built-in default does.
function NpsStep({ step, onNext }: CustomStepProps) {
  const [score, setScore] = useState<number | null>(null)
  const scale = (step.data?.scale as number) ?? 10
  const options = Array.from({ length: scale + 1 }, (_, i) => i)

  return (
    <div className="ck-step">
      <h2 className="ck-step-title">How likely are you to recommend us?</h2>
      <p className="ck-step-description">0 = not at all, {scale} = extremely likely.</p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${scale + 1}, 1fr)`,
          gap: 4,
          marginBottom: 12,
        }}
      >
        {options.map((n) => {
          const isSelected = n === score
          return (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              style={{
                appearance: 'none',
                aspectRatio: '1 / 1',
                border: `1.5px solid ${isSelected ? 'var(--ck-color-primary)' : 'var(--ck-color-border)'}`,
                background: isSelected ? 'var(--ck-color-primary-soft)' : 'var(--ck-color-surface)',
                color: isSelected ? 'var(--ck-color-primary)' : 'var(--ck-color-text)',
                borderRadius: 'var(--ck-radius-sm)',
                fontFamily: 'var(--ck-font-mono)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--ck-motion-fast)',
              }}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--ck-color-text-muted)',
          marginBottom: 20,
        }}
      >
        <span>Not at all likely</span>
        <span>Extremely likely</span>
      </div>

      <button
        type="button"
        className="ck-button ck-button-primary"
        onClick={() => onNext({ npsScore: score })}
        disabled={score === null}
      >
        Continue
      </button>
    </div>
  )
}

// Custom seat-change offer with a +/- stepper. The savings panel is the
// win condition for a price-sensitive customer, so it's rendered with the
// success-soft background once the user has actually picked a lower count.
function SeatAdjuster({ offer, onAccept, onDecline, isProcessing }: CustomOfferProps) {
  const data = (offer as { data?: Record<string, unknown> }).data ?? {}
  const currentSeats = (data.currentSeats as number) ?? 10
  const minSeats = (data.minSeats as number) ?? 1
  const pricePerSeat = (data.pricePerSeat as number) ?? 10

  const [seats, setSeats] = useState(Math.max(minSeats, currentSeats - 1))
  const currentMonthly = currentSeats * pricePerSeat
  const newMonthly = seats * pricePerSeat
  const savings = currentMonthly - newMonthly
  const unchanged = seats === currentSeats

  return (
    <div className="ck-step ck-step-offer">
      <h2 className="ck-step-title">Drop unused seats</h2>
      <p className="ck-step-description">
        You're on {currentSeats} seats at ${currentMonthly}/mo. Adjust to a smaller team and keep everything else.
      </p>

      <div className="ck-offer-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            padding: '24px 0',
            background: 'var(--ck-color-surface-muted)',
            borderRadius: 'var(--ck-radius-lg)',
            marginBottom: 16,
          }}
        >
          <SeatStep
            onClick={() => setSeats((s) => Math.max(minSeats, s - 1))}
            disabled={seats <= minSeats}
            label="Decrease seats"
          >
            −
          </SeatStep>
          <div style={{ minWidth: 96, textAlign: 'center' }}>
            <div
              style={{
                fontSize: 44,
                fontWeight: 700,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
                color: 'var(--ck-color-text)',
              }}
            >
              {seats}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ck-color-text-muted)',
                marginTop: 4,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {seats === 1 ? 'Seat' : 'Seats'}
            </div>
          </div>
          <SeatStep
            onClick={() => setSeats((s) => Math.min(currentSeats, s + 1))}
            disabled={seats >= currentSeats}
            label="Increase seats"
          >
            +
          </SeatStep>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '12px 16px',
            background: savings > 0 ? 'var(--ck-color-success-soft)' : 'transparent',
            border: `1px solid ${savings > 0 ? 'transparent' : 'var(--ck-color-border)'}`,
            borderRadius: 'var(--ck-radius-md)',
            marginBottom: 20,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--ck-color-text-muted)',
              }}
            >
              New monthly bill
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--ck-color-text)',
                marginTop: 2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              ${newMonthly}
            </div>
          </div>
          {savings > 0 && (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ck-color-success)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              save ${savings}/mo
            </div>
          )}
        </div>

        <button
          type="button"
          className="ck-button ck-button-primary"
          onClick={() => onAccept({ seats, previousSeats: currentSeats, monthlyDelta: newMonthly - currentMonthly })}
          disabled={isProcessing || unchanged}
        >
          {isProcessing
            ? 'Updating…'
            : unchanged
              ? 'Pick a lower seat count'
              : `Reduce to ${seats} seat${seats === 1 ? '' : 's'}`}
        </button>
        <button type="button" className="ck-button-link" onClick={onDecline}>
          No thanks, cancel
        </button>
      </div>
    </div>
  )
}

function SeatStep({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        appearance: 'none',
        width: 44,
        height: 44,
        borderRadius: 999,
        border: '1px solid var(--ck-color-border)',
        background: 'var(--ck-color-surface)',
        boxShadow: '0 1px 2px rgba(12, 10, 9, 0.04), 0 1px 3px rgba(12, 10, 9, 0.06)',
        fontSize: 22,
        fontWeight: 500,
        color: 'var(--ck-color-text)',
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all var(--ck-motion-fast)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
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
  // activity in the in-UI log panel. Logs the SDK's three call families:
  // /cancel-flow/config (token-mode init), /cancel-flow/actions/* (offer
  // accept), and /api/sessions/sdk (session record).
  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const isSdkRequest =
        url.includes('/api/sessions') || url.includes('/cancel-flow/config') || url.includes('/cancel-flow/actions/')
      if (isSdkRequest) {
        log(`→ ${init?.method ?? 'GET'} ${url}`)
      }
      try {
        const res = await originalFetch(input, init)
        if (isSdkRequest) {
          log(`← ${res.status} ${url}`)
        }
        return res
      } catch (err) {
        if (isSdkRequest) {
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
                  duration: { interval: 'month' as const },
                },
              },
            ],
          },
        ]
      : undefined

  const needsToken = ['token', 'token-analytics', 'steps-merge'].includes(scenario)

  // Memoize on identity fields. Without useMemo the Date.now() in the payload
  // produces a fresh token string each render, which the SDK reads as a new
  // session and refetches /cancel-flow/config — resetting the flow to step 1.
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

  const appearance: Appearance = scenario === 'color-scheme' ? { colorScheme } : {}

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
  const needsCustomer = scenario !== 'open-source' && scenario !== 'color-scheme'

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

      {/* Color scheme picker (color-scheme scenario only) */}
      {scenario === 'color-scheme' && (
        <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, color: '#374151', padding: '0 4px' }}>Color scheme</legend>
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
