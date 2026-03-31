# @churnkey/react

A production-ready cancel flow for React. Beautiful out of the box, fully customizable, extensible with custom step and offer types.

Works standalone (free, open source) or with [Churnkey](https://churnkey.co) for AI-powered retention.

## Install

```bash
npm install @churnkey/react
```

## Quick start

```tsx
import { CancelFlow } from '@churnkey/react'
import '@churnkey/react/styles.css'

function Settings() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}>Cancel subscription</button>
      {open && (
        <CancelFlow
          steps={[
            {
              type: 'survey',
              title: 'Why are you leaving?',
              reasons: [
                { id: 'expensive', label: 'Too expensive',
                  offer: { type: 'discount', percent: 20, months: 3 } },
                { id: 'not-using', label: 'Not using it enough',
                  offer: { type: 'pause', months: 2 } },
                { id: 'missing', label: 'Missing features' },
              ],
            },
            { type: 'feedback', title: 'Anything else?' },
            { type: 'confirm' },
          ]}
          onAccept={async (offer) => {
            if (offer.type === 'discount') await applyDiscount(offer.couponId)
            if (offer.type === 'pause') await pauseSubscription(offer.months)
          }}
          onCancel={async () => await cancelSubscription()}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
```

## Customization levels

### 1. Appearance API

```tsx
<CancelFlow
  steps={steps}
  appearance={{
    theme: 'minimal',
    variables: { colorPrimary: '#7c3aed', borderRadius: '16px' },
  }}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

### 2. className overrides

```tsx
<CancelFlow
  steps={steps}
  classNames={{
    modal: 'max-w-lg rounded-2xl shadow-2xl',
    overlay: 'bg-black/60 backdrop-blur-sm',
  }}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

### 3. Component overrides

Replace any sub-component while keeping the flow logic:

```tsx
<CancelFlow
  steps={steps}
  components={{
    ReasonButton: ({ reason, isSelected, onSelect }) => (
      <button
        onClick={() => onSelect(reason.id)}
        className={isSelected ? 'selected' : ''}
      >
        {reason.label}
      </button>
    ),
  }}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

### 4. Custom step and offer types

Define your own step types with custom rendering:

```tsx
<CancelFlow
  steps={[
    { type: 'survey', reasons: [
      { id: 'seats', label: 'Too many seats',
        offer: { type: 'change-seats', data: { minSeats: 1 } } },
    ]},
    { type: 'nps', title: 'Quick question', data: { scale: 10 } },
    { type: 'feedback' },
    { type: 'confirm' },
  ]}
  customComponents={{
    'nps': ({ step, onNext }) => (
      <NpsRating scale={step.data.scale} onSubmit={(score) => onNext({ score })} />
    ),
    'change-seats': ({ offer, onAccept }) => (
      <SeatAdjuster onConfirm={(seats) => onAccept({ seats })} />
    ),
  }}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

### 5. Headless hook

Full UI control — bring your own components:

```tsx
import { useCancelFlow } from '@churnkey/react/headless'

function MyCancelPage() {
  const flow = useCancelFlow({
    steps,
    onAccept: handleOffer,
    onCancel: handleCancel,
  })

  return (
    <div>
      {flow.step === 'survey' && flow.reasons.map((r) => (
        <button key={r.id} onClick={() => flow.selectReason(r.id)}>
          {r.label}
        </button>
      ))}
      {flow.step === 'offer' && (
        <>
          <p>{flow.recommendation.copy.headline}</p>
          <button onClick={flow.accept}>Accept</button>
          <button onClick={flow.decline}>No thanks</button>
        </>
      )}
    </div>
  )
}
```

## Connect to Churnkey

Add a session token to get AI-powered offer selection, analytics, and session recording. The component API stays the same.

**Server (Node.js):**

```typescript
import { Churnkey } from '@churnkey/node'

const ck = new Churnkey({ appId: 'app_...', apiKey: 'sk_...' })
const token = ck.createToken({ customerId: 'cus_123' })
// Pass token to the frontend
```

**Client:**

```tsx
<CancelFlow
  session={token}
  onAccept={async (offer) => { /* runs after the SDK applies the offer */ }}
  onCancel={async () => { /* runs after the SDK cancels */ }}
/>
```

In connected mode, the SDK fetches your cancel flow config from Churnkey, executes offers via the API, and records session outcomes for analytics. Your custom components and appearance settings carry over unchanged.

## Subpath exports

```tsx
import { CancelFlow } from '@churnkey/react'              // everything
import { useCancelFlow } from '@churnkey/react/headless'   // hook only, no UI
import { CancelFlowMachine } from '@churnkey/react/core'   // state machine, no React
```

## License

MIT
