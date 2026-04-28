import { CancelFlow } from '@churnkey/react'
import type { CustomOfferProps, CustomStepProps, ReasonButtonProps, Step } from '@churnkey/react/core'
import { useCancelFlow } from '@churnkey/react/headless'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import '@churnkey/react/styles.css'

// --- Shared config ---

const steps: Step[] = [
  {
    type: 'survey',
    title: 'Why are you leaving?',
    description: 'Your feedback helps us improve.',
    reasons: [
      { id: 'expensive', label: 'Too expensive', offer: { type: 'discount', percent: 20, months: 3 } },
      { id: 'not-using', label: 'Not using it enough', offer: { type: 'pause', months: 2 } },
      { id: 'missing', label: 'Missing features' },
      { id: 'other', label: 'Other' },
    ],
  },
  { type: 'feedback', title: 'Anything else we should know?' },
  {
    type: 'confirm',
    title: 'Confirm cancellation',
    description: 'Your access continues until the end of your billing period.',
  },
]

const handleAccept = async (offer: { type: string }) => {
  console.log('Accepted:', offer)
  await new Promise((r) => setTimeout(r, 1000))
}

const handleCancel = async () => {
  console.log('Cancelled')
  await new Promise((r) => setTimeout(r, 1000))
}

// --- 1. Drop-in ---

function DropInDemo() {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>1. Drop-in</h2>
      <p style={descStyle}>Default component, no customization.</p>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Open
      </button>
      {open && (
        <CancelFlow steps={steps} onAccept={handleAccept} onCancel={handleCancel} onClose={() => setOpen(false)} />
      )}
    </section>
  )
}

// --- 2. Themes + dark mode ---

function ThemedDemo() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<'default' | 'minimal' | 'rounded' | 'corporate'>('minimal')
  const [colorScheme, setColorScheme] = useState<'light' | 'dark' | 'auto'>('light')
  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>2. Themes + Dark Mode</h2>
      <p style={descStyle}>
        <code>appearance.theme</code> + <code>appearance.colorScheme</code>
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['default', 'minimal', 'rounded', 'corporate'] as const).map((t) => (
          <Pill key={t} label={t} selected={theme === t} onClick={() => setTheme(t)} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['light', 'dark', 'auto'] as const).map((s) => (
          <Pill key={s} label={s} selected={colorScheme === s} onClick={() => setColorScheme(s)} />
        ))}
      </div>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Open
      </button>
      {open && (
        <CancelFlow
          steps={steps}
          appearance={{ theme, colorScheme }}
          onAccept={handleAccept}
          onCancel={handleCancel}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}

// --- 3. All offer types ---

const allOfferSteps: Step[] = [
  {
    type: 'survey',
    title: 'Why are you cancelling?',
    reasons: [
      { id: 'expensive', label: 'Too expensive', offer: { type: 'discount', percent: 25, months: 3 } },
      { id: 'not-using', label: 'Not using it enough', offer: { type: 'pause', months: 3 } },
      {
        id: 'wrong-plan',
        label: 'Wrong plan for me',
        offer: {
          type: 'plan_change',
          plans: [
            {
              id: 'starter',
              name: 'Starter',
              price: 9,
              interval: 'month',
              currency: 'USD',
              features: ['1 user', '5 projects'],
            },
            {
              id: 'pro',
              name: 'Pro',
              price: 29,
              interval: 'month',
              currency: 'USD',
              features: ['5 users', 'Unlimited projects', 'Priority support'],
            },
          ],
        },
      },
      { id: 'trial', label: 'Need more time to evaluate', offer: { type: 'trial_extension', days: 14 } },
      { id: 'other', label: 'Other reason' },
    ],
  },
  { type: 'feedback', title: 'Anything else?' },
  { type: 'confirm' },
]

function AllOfferTypesDemo() {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>3. All Offer Types</h2>
      <p style={descStyle}>Discount, pause, plan change, and trial extension.</p>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Open
      </button>
      {open && (
        <CancelFlow
          steps={allOfferSteps}
          onAccept={handleAccept}
          onCancel={handleCancel}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}

// --- 4. Component override ---

function CustomReasonButton({ reason, isSelected, onSelect }: ReasonButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(reason.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '14px 16px',
        border: `2px solid ${isSelected ? '#7c3aed' : '#e5e7eb'}`,
        borderRadius: 16,
        background: isSelected ? '#f5f3ff' : '#fff',
        cursor: 'pointer',
        fontSize: 15,
        fontFamily: 'inherit',
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: `2px solid ${isSelected ? '#7c3aed' : '#d1d5db'}`,
          background: isSelected ? '#7c3aed' : 'transparent',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isSelected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
      </span>
      <span style={{ fontWeight: 500 }}>{reason.label}</span>
    </button>
  )
}

function ComponentOverrideDemo() {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>4. Component Override</h2>
      <p style={descStyle}>
        Custom <code>ReasonButton</code> via <code>components</code> prop.
      </p>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Open
      </button>
      {open && (
        <CancelFlow
          steps={steps}
          appearance={{ variables: { colorPrimary: '#7c3aed', colorPrimaryHover: '#6d28d9', borderRadius: '16px' } }}
          components={{ ReasonButton: CustomReasonButton }}
          onAccept={handleAccept}
          onCancel={handleCancel}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}

// --- 5. Custom steps + custom offers ---

function NpsStep({ step, onNext }: CustomStepProps) {
  const [score, setScore] = useState<number | null>(null)
  const scale = (step.data?.scale as number) ?? 10
  return (
    <div style={{ padding: '24px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>How likely are you to recommend us? (0-{scale})</p>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
        {Array.from({ length: scale + 1 }, (_, i) => (
          <button
            type="button"
            key={i}
            onClick={() => setScore(i)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              fontSize: 13,
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
        style={{ ...btnStyle, opacity: score !== null ? 1 : 0.5 }}
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

  const decrement = () => setSeats((s) => Math.max(minSeats, s - 1))
  const increment = () => setSeats((s) => Math.min(currentSeats, s + 1))

  return (
    <div style={{ padding: '8px 0 24px', textAlign: 'center' }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Pay for what you use</h3>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '6px 0 24px' }}>
        You're on {currentSeats} seats at ${currentMonthly}/mo. Drop unused seats and keep the rest.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 16 }}>
        <button
          type="button"
          onClick={decrement}
          disabled={seats <= minSeats}
          style={{
            ...pillStyle,
            width: 40,
            height: 40,
            padding: 0,
            fontSize: 20,
            opacity: seats <= minSeats ? 0.4 : 1,
          }}
          aria-label="Decrease seats"
        >
          −
        </button>
        <div style={{ minWidth: 80 }}>
          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{seats}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>seat{seats === 1 ? '' : 's'}</div>
        </div>
        <button
          type="button"
          onClick={increment}
          disabled={seats >= currentSeats}
          style={{
            ...pillStyle,
            width: 40,
            height: 40,
            padding: 0,
            fontSize: 20,
            opacity: seats >= currentSeats ? 0.4 : 1,
          }}
          aria-label="Increase seats"
        >
          +
        </button>
      </div>

      <div
        style={{
          background: '#f9fafb',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 14,
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
        onClick={() =>
          onAccept({
            seats,
            previousSeats: currentSeats,
            monthlyDelta: newMonthly - currentMonthly,
          })
        }
        disabled={isProcessing || unchanged}
        style={{ ...btnStyle, opacity: isProcessing || unchanged ? 0.5 : 1 }}
      >
        {isProcessing ? 'Updating…' : unchanged ? 'Pick a lower seat count' : `Reduce to ${seats} seats`}
      </button>
      <button
        type="button"
        onClick={onDecline}
        style={{
          ...pillStyle,
          border: 'none',
          color: '#9ca3af',
          fontSize: 13,
          display: 'block',
          margin: '10px auto 0',
        }}
      >
        No thanks, cancel
      </button>
    </div>
  )
}

const customStepDemoSteps: Step[] = [
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
  { type: 'nps', title: 'One quick question', data: { scale: 10 } },
  { type: 'feedback', title: 'Anything else?' },
  { type: 'confirm' },
]

function CustomStepDemo() {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>5. Custom Steps + Custom Offers</h2>
      <p style={descStyle}>
        Custom <code>nps</code> step and <code>change-seats</code> offer alongside built-in types.
      </p>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Open
      </button>
      {open && (
        <CancelFlow
          steps={customStepDemoSteps}
          customComponents={{ nps: NpsStep, 'change-seats': SeatAdjuster }}
          onAccept={handleAccept}
          onCancel={handleCancel}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}

// --- 6. Headless ---

function HeadlessDemo() {
  const flow = useCancelFlow({ steps, onAccept: handleAccept, onCancel: handleCancel })
  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>6. Headless Hook</h2>
      <p style={descStyle}>
        <code>useCancelFlow()</code> with your own UI.
      </p>
      <div style={{ background: '#f9fafb', padding: 16, borderRadius: 12, border: '1px solid #e5e7eb' }}>
        <p style={{ fontSize: 14 }}>
          <strong>Step:</strong> {flow.step} ({flow.stepIndex + 1}/{flow.totalSteps}){' | '}
          <strong>Reason:</strong> {flow.selectedReason ?? 'none'}
          {' | '}
          <strong>Offer:</strong> {flow.currentOffer?.type ?? 'none'}
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {flow.step === 'survey' &&
            flow.reasons.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => flow.selectReason(r.id)}
                style={{ ...pillStyle, fontWeight: flow.selectedReason === r.id ? 700 : 400 }}
              >
                {r.label}
              </button>
            ))}
          {flow.step === 'survey' && (
            <button type="button" onClick={() => flow.next()} disabled={!flow.selectedReason} style={pillStyle}>
              Next
            </button>
          )}
          {flow.step === 'offer' && (
            <>
              <button type="button" onClick={() => flow.accept()} style={pillStyle}>
                Accept
              </button>
              <button type="button" onClick={flow.decline} style={pillStyle}>
                Decline
              </button>
            </>
          )}
          {flow.step === 'feedback' && (
            <button type="button" onClick={() => flow.next()} style={pillStyle}>
              Skip
            </button>
          )}
          {flow.step === 'confirm' && (
            <>
              <button type="button" onClick={flow.cancel} style={pillStyle}>
                Confirm Cancel
              </button>
              <button type="button" onClick={flow.back} style={pillStyle}>
                Back
              </button>
            </>
          )}
          {flow.step === 'success' && <span style={{ fontSize: 14, color: '#666' }}>Outcome: {flow.outcome}</span>}
        </div>
      </div>
    </section>
  )
}

// --- 7. Token mode ---

function TokenModeDemo() {
  const params = new URLSearchParams(window.location.search)
  const urlToken = params.get('token')
  const apiBaseUrl = params.get('api') ?? undefined
  const [pastedToken, setPastedToken] = useState('')
  const [open, setOpen] = useState(false)

  const activeToken = urlToken || pastedToken || null
  const hasToken = activeToken?.startsWith('ck_') ?? false

  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>7. Token Mode</h2>
      <p style={descStyle}>
        Config from Churnkey API. Pass <code>?token=ck_...&api=http://localhost:3000/v1</code> or paste below.
      </p>
      {urlToken ? (
        <p style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginBottom: 12 }}>
          Token loaded from URL: <code style={{ fontSize: 11, color: '#666' }}>{urlToken.slice(0, 40)}...</code>
        </p>
      ) : (
        <input
          type="text"
          placeholder="Paste token (ck_...)"
          value={pastedToken}
          onChange={(e) => setPastedToken(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: 13,
            fontFamily: 'monospace',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            boxSizing: 'border-box',
            marginBottom: 12,
          }}
        />
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!hasToken}
        style={{ ...btnStyle, opacity: hasToken ? 1 : 0.5, cursor: hasToken ? 'pointer' : 'not-allowed' }}
      >
        Open
      </button>
      {open && activeToken && (
        <CancelFlow
          session={activeToken}
          apiBaseUrl={apiBaseUrl}
          onAccept={async (offer) => console.log('Accepted:', offer)}
          onCancel={async () => console.log('Cancelled')}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}

// --- Layout ---

export function App() {
  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'system-ui', padding: '0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>SDK Playground</h1>
        <a href="?test" style={{ fontSize: 13, color: '#6b7280' }}>
          Test Harness
        </a>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <DropInDemo />
        <ThemedDemo />
        <AllOfferTypesDemo />
        <ComponentOverrideDemo />
        <CustomStepDemo />
        <HeadlessDemo />
        <TokenModeDemo />
      </div>
    </div>
  )
}

// --- Shared styles ---

function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...pillStyle,
        fontWeight: selected ? 700 : 400,
        borderColor: selected ? '#2563eb' : '#d1d5db',
      }}
    >
      {label}
    </button>
  )
}

const descStyle: CSSProperties = { color: '#666', marginBottom: 12, fontSize: 14 }

const btnStyle: CSSProperties = {
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'inherit',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
}

const pillStyle: CSSProperties = {
  padding: '6px 14px',
  fontSize: 13,
  fontFamily: 'inherit',
  background: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  cursor: 'pointer',
}
