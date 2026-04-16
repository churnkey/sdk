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

### Analytics (no backend work)

Add `appId` and `customer` to enable session recording and dashboard analytics. Steps and offers are still defined in your code.

```tsx
<CancelFlow
  appId="app_xxx"
  customer={{ id: 'cus_123' }}
  steps={steps}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

For richer analytics (revenue, plan segmentation), add `subscriptions` using the [Churnkey Direct format](https://docs.churnkey.co/billing-providers/direct-connect/direct):

```tsx
<CancelFlow
  appId="app_xxx"
  customer={{ id: 'cus_123', email: 'jane@acme.com' }}
  subscriptions={[{
    id: 'sub_456',
    start: '2024-06-01',
    status: { name: 'active', currentPeriod: { start: '2025-04-01', end: '2025-05-01' } },
    items: [{ price: { id: 'price_pro', amount: { value: 2999 } } }],
  }]}
  steps={steps}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

### Connected (billing actions + server config)

Add a session token to let Churnkey execute billing actions and provide server-driven flow config.

**Server:**

```typescript
import { Churnkey } from '@churnkey/node'

const ck = new Churnkey({ appId: 'app_...', apiKey: 'sk_...' })
const token = ck.createToken({ customerId: 'cus_123' })
```

**Client:**

```tsx
<CancelFlow
  appId="app_xxx"
  customer={{ id: 'cus_123', email: 'jane@acme.com' }}
  subscriptions={[...]}
  session={token}
  onAccept={async (offer) => { /* runs AFTER the SDK applies the offer */ }}
  onCancel={async () => { /* runs AFTER the SDK cancels */ }}
/>
```

Each step adds props. No step removes or changes them. Custom components and appearance settings carry over unchanged.

## Subpath exports

```tsx
import { CancelFlow } from '@churnkey/react'              // everything
import { useCancelFlow } from '@churnkey/react/headless'   // hook only, no UI
import { CancelFlowMachine } from '@churnkey/react/core'   // state machine, no React
```

## License

MIT
