import { CancelFlow } from '@churnkey/react'
import type { CustomOfferProps, CustomStepProps, OfferDecision, ReasonButtonProps, Step } from '@churnkey/react/core'
import { useCancelFlow } from '@churnkey/react/headless'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import '@churnkey/react/styles.css'

const steps: Step[] = [
  {
    type: 'survey',
    title: 'Why are you leaving?',
    description: 'Your feedback helps us improve.',
    reasons: [
      {
        id: 'expensive',
        label: 'Too expensive',
        offer: { type: 'discount', percent: 20, months: 3 },
      },
      {
        id: 'not-using',
        label: 'Not using it enough',
        offer: { type: 'pause', months: 2 },
      },
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

const handleAccept = async (offer: unknown) => {
  console.log('Accepted:', offer)
  await new Promise((r) => setTimeout(r, 1000))
}

const handleCancel = async () => {
  console.log('Cancelled')
  await new Promise((r) => setTimeout(r, 1000))
}

// --- Demo 1: Default drop-in ---
function DropInDemo() {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>1. Default Drop-in</h2>
      <p style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>
        <code>&lt;CancelFlow steps=&#123;...&#125; /&gt;</code> — zero customization.
      </p>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Open Cancel Flow
      </button>
      {open && (
        <CancelFlow steps={steps} onAccept={handleAccept} onCancel={handleCancel} onClose={() => setOpen(false)} />
      )}
    </section>
  )
}

// --- Demo 2: Theme presets + dark mode ---
function ThemedDemo() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<'default' | 'minimal' | 'rounded' | 'corporate'>('minimal')
  const [colorScheme, setColorScheme] = useState<'light' | 'dark' | 'auto'>('light')
  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>2. Themes + Dark Mode</h2>
      <p style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>
        <code>appearance.theme</code> + <code>appearance.colorScheme</code>
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['default', 'minimal', 'rounded', 'corporate'] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTheme(t)}
            style={{
              ...pillStyle,
              fontWeight: theme === t ? 700 : 400,
              borderColor: theme === t ? '#2563eb' : '#d1d5db',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['light', 'dark', 'auto'] as const).map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => setColorScheme(s)}
            style={{
              ...pillStyle,
              fontWeight: colorScheme === s ? 700 : 400,
              borderColor: colorScheme === s ? '#2563eb' : '#d1d5db',
            }}
          >
            {s === 'auto' ? '☀️/🌙 auto' : s === 'dark' ? '🌙 dark' : '☀️ light'}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Open Themed Flow
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

// --- Demo 3: Component override ---
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
      <h2 style={{ marginBottom: 4 }}>3. Component Override</h2>
      <p style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>
        Custom <code>ReasonButton</code> component via <code>components</code> prop.
      </p>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Open Custom Flow
      </button>
      {open && (
        <CancelFlow
          steps={steps}
          appearance={{
            variables: {
              colorPrimary: '#7c3aed',
              colorPrimaryHover: '#6d28d9',
              borderRadius: '16px',
            },
          }}
          components={{
            ReasonButton: CustomReasonButton,
          }}
          onAccept={handleAccept}
          onCancel={handleCancel}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}

// --- Demo 4: Headless ---
function HeadlessDemo() {
  const flow = useCancelFlow({
    steps,
    onAccept: handleAccept,
    onCancel: handleCancel,
  })

  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>4. Headless Hook</h2>
      <p style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>
        <code>useCancelFlow()</code> — you control the UI.
      </p>
      <div style={{ background: '#f9fafb', padding: 16, borderRadius: 12, border: '1px solid #e5e7eb' }}>
        <p style={{ fontSize: 14 }}>
          <strong>Step:</strong> {flow.step} ({flow.stepIndex + 1}/{flow.totalSteps}) &nbsp;|&nbsp;
          <strong>Selected:</strong> {flow.selectedReason ?? 'none'}
          &nbsp;|&nbsp;
          <strong>Offer:</strong> {flow.recommendation?.type ?? 'none'}
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
            <button type="button" onClick={flow.next} disabled={!flow.selectedReason} style={pillStyle}>
              Next
            </button>
          )}
          {flow.step === 'offer' && (
            <>
              <button type="button" onClick={flow.accept} style={pillStyle}>
                Accept
              </button>
              <button type="button" onClick={flow.decline} style={pillStyle}>
                Decline
              </button>
            </>
          )}
          {flow.step === 'feedback' && (
            <button type="button" onClick={flow.next} style={pillStyle}>
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

// --- Demo 5: All offer types ---
const allOfferSteps: Step[] = [
  {
    type: 'survey',
    title: 'Why are you cancelling?',
    description: 'Select the reason that best applies.',
    reasons: [
      {
        id: 'expensive',
        label: 'Too expensive',
        offer: { type: 'discount', percent: 25, months: 3 },
      },
      {
        id: 'not-using',
        label: 'Not using it enough',
        offer: { type: 'pause', months: 3 },
      },
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
      {
        id: 'trial',
        label: 'Need more time to evaluate',
        offer: { type: 'trial_extension', days: 14 },
      },
      { id: 'other', label: 'Other reason' },
    ],
  },
  { type: 'feedback', title: 'Anything else?' },
  {
    type: 'confirm',
    title: 'Confirm cancellation',
    description: 'Your access continues until the end of your billing period.',
  },
]

function AllOfferTypesDemo() {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>5. All Offer Types</h2>
      <p style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>
        Discount, pause, plan change, and trial extension offers.
      </p>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Open All Offers Flow
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

// --- Demo 6: Token mode ---
// Read from URL: ?token=ck_...&api=http://localhost:3000/v1
function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('token')
}

function getApiBaseUrlFromUrl(): string | undefined {
  const params = new URLSearchParams(window.location.search)
  return params.get('api') ?? undefined
}

function TokenModeDemo() {
  const urlToken = getTokenFromUrl()
  const apiBaseUrl = getApiBaseUrlFromUrl()
  const [pastedToken, setPastedToken] = useState('')
  const [open, setOpen] = useState(false)

  const activeToken = urlToken || pastedToken || null
  const hasRealToken = activeToken?.startsWith('ck_') ?? false

  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>6. Token Mode (Connected)</h2>
      <p style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>
        <code>&lt;CancelFlow session=&#123;token&#125; /&gt;</code> — fetches config from Churnkey API.
      </p>

      {urlToken ? (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>Token loaded from URL</p>
          <code style={{ fontSize: 11, color: '#666', wordBreak: 'break-all', display: 'block' }}>
            {urlToken.slice(0, 40)}...
          </code>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>
            Generate a token with:{' '}
            <code style={{ fontSize: 12 }}>
              npx tsx sdk/scripts/generate-token.ts &lt;appId&gt; &lt;apiKey&gt; &lt;customerId&gt;
            </code>
          </p>
          <input
            type="text"
            placeholder="Paste token here (ck_...)"
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
            }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!hasRealToken}
        style={{
          ...btnStyle,
          opacity: hasRealToken ? 1 : 0.5,
          cursor: hasRealToken ? 'pointer' : 'not-allowed',
        }}
      >
        Open Token Flow
      </button>
      {open && activeToken && (
        <CancelFlow
          session={activeToken}
          apiBaseUrl={apiBaseUrl}
          onAccept={async (offer) => console.log('Token mode accepted:', offer)}
          onCancel={async () => console.log('Token mode cancelled')}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}

// --- Demo 7: Custom steps + custom offers ---
function NpsStep({ step, onNext }: CustomStepProps) {
  const [score, setScore] = useState<number | null>(null)
  const scale = (step.data?.scale as number) ?? 10

  return (
    <div style={{ padding: '24px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>How likely are you to recommend us? (0–{scale})</p>
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
  const data = (offer as OfferDecision & { data?: Record<string, unknown> }).data
  const minSeats = (data?.minSeats as number) ?? 1
  const pricePerSeat = (data?.pricePerSeat as number) ?? 10
  const [seats, setSeats] = useState(minSeats)

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 15, fontWeight: 600 }}>{offer.copy.headline}</p>
        <p style={{ fontSize: 14, color: '#666', marginTop: 4 }}>{offer.copy.body}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setSeats(Math.max(minSeats, seats - 1))}
          style={{ ...pillStyle, width: 36, height: 36, padding: 0, fontSize: 18 }}
        >
          −
        </button>
        <span style={{ fontSize: 28, fontWeight: 700, minWidth: 48, textAlign: 'center' }}>{seats}</span>
        <button
          type="button"
          onClick={() => setSeats(seats + 1)}
          style={{ ...pillStyle, width: 36, height: 36, padding: 0, fontSize: 18 }}
        >
          +
        </button>
      </div>
      <p style={{ textAlign: 'center', fontSize: 14, color: '#666', marginBottom: 20 }}>
        {seats} seat{seats === 1 ? '' : 's'} × ${pricePerSeat}/mo = <strong>${seats * pricePerSeat}/mo</strong>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={() => onAccept({ seats })} disabled={isProcessing} style={btnStyle}>
          {isProcessing ? 'Updating...' : `Switch to ${seats} seat${seats === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          onClick={onDecline}
          style={{ ...pillStyle, border: 'none', color: '#9ca3af', fontSize: 13 }}
        >
          No thanks
        </button>
      </div>
    </div>
  )
}

const customStepDemoSteps: Step[] = [
  {
    type: 'survey',
    title: 'Why are you cancelling?',
    reasons: [
      {
        id: 'too-many-seats',
        label: 'Too many seats',
        offer: { type: 'change-seats', data: { minSeats: 1, pricePerSeat: 10 } },
      },
      {
        id: 'expensive',
        label: 'Too expensive',
        offer: { type: 'discount', percent: 20, months: 3 },
      },
      { id: 'missing', label: 'Missing features' },
    ],
  },
  { type: 'nps', title: 'One quick question', data: { scale: 10 } },
  { type: 'feedback', title: 'Anything else?' },
  {
    type: 'confirm',
    title: 'Confirm cancellation',
    description: 'Your access continues until the end of your billing period.',
  },
]

function CustomStepDemo() {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>7. Custom Steps + Custom Offers</h2>
      <p style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>
        Custom <code>nps</code> step and custom <code>change-seats</code> offer type, alongside built-in types.
      </p>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Open Custom Step Flow
      </button>
      {open && (
        <CancelFlow
          steps={customStepDemoSteps}
          customComponents={{
            nps: NpsStep,
            'change-seats': SeatAdjuster,
          }}
          onAccept={async (offer) => {
            console.log('Accepted:', offer)
            await new Promise((r) => setTimeout(r, 1000))
          }}
          onCancel={handleCancel}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}

export function App() {
  return (
    <div style={{ maxWidth: 600, margin: '60px auto', fontFamily: 'system-ui', padding: '0 24px' }}>
      <h1 style={{ fontSize: 28, marginBottom: 32 }}>Churnkey SDK Playground</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <DropInDemo />
        <ThemedDemo />
        <ComponentOverrideDemo />
        <AllOfferTypesDemo />
        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb' }} />
        <HeadlessDemo />
        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb' }} />
        <CustomStepDemo />
        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb' }} />
        <TokenModeDemo />
      </div>
    </div>
  )
}

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
