# @churnkey/react

A cancel flow component for React. Survey, offers, feedback, and confirmation. Ready to use out of the box, fully customizable when you need it.

Open source. Optionally connects to [Churnkey](https://churnkey.co) for analytics and AI-powered retention.

## Installation

```bash
npm install @churnkey/react
```

## Create a cancel flow

Import the component and the stylesheet, define your steps, and handle the result.

```tsx
import { CancelFlow } from '@churnkey/react'
import '@churnkey/react/styles.css'

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
    if (offer.type === 'discount') await applyDiscount(offer)
    if (offer.type === 'pause') await pauseSubscription(offer)
  }}
  onCancel={async () => await cancelSubscription()}
  onClose={() => setOpen(false)}
/>
```

When a customer selects "Too expensive," the SDK shows them the discount offer. If they accept, your `onAccept` handler runs. If they decline all offers and confirm, `onCancel` runs.

## Change the look

Pick a theme, override variables, or both. Four themes ship with light and dark variants.

```tsx
<CancelFlow
  appearance={{ theme: 'minimal', colorScheme: 'dark' }}
  steps={steps}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

You can override individual tokens on top of any theme:

```tsx
appearance={{
  theme: 'rounded',
  variables: { colorPrimary: '#7c3aed', borderRadius: '20px' },
}}
```

For class-based styling (Tailwind, CSS modules), use `classNames`:

```tsx
classNames={{
  modal: 'max-w-lg shadow-2xl',
  overlay: 'bg-black/60 backdrop-blur-sm',
}}
```

## Replace components

Swap out any piece of the UI. The SDK handles navigation and state; you handle rendering.

```tsx
<CancelFlow
  steps={steps}
  components={{
    ReasonButton: ({ reason, isSelected, onSelect }) => (
      <button
        onClick={() => onSelect(reason.id)}
        className={isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
      >
        {reason.label}
      </button>
    ),
  }}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

You can replace `Modal`, `Header`, `Survey`, `Offer`, `Feedback`, `Confirm`, `Success`, `ReasonButton`, `OfferCard`, and each offer detail component.

## Add custom steps

The step system is open. Use any string as a step type, then register a component for it.

```tsx
<CancelFlow
  steps={[
    { type: 'survey', reasons: [
      { id: 'seats', label: 'Too many seats',
        offer: { type: 'change-seats', data: { minSeats: 1 } } },
    ]},
    { type: 'nps', title: 'One quick question', data: { scale: 10 } },
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

Custom steps navigate like built-in ones. Custom offers appear when a matching reason is selected. Whatever you pass to `onNext(result)` or `onAccept(result)` shows up on `offer.result` in your `onAccept` handler, and is recorded with the session for analytics (as `customStepResults[stepType]` for steps, `acceptedOffer.customOfferResult` for offers).

## Go headless

Use the hook directly if you want full control over the UI.

```tsx
import { useCancelFlow } from '@churnkey/react/headless'

function MyCancelPage() {
  const flow = useCancelFlow({ steps, onAccept: handleOffer, onCancel: handleCancel })

  if (flow.step === 'survey') {
    return (
      <div>
        {flow.reasons.map((r) => (
          <button key={r.id} onClick={() => flow.selectReason(r.id)}>{r.label}</button>
        ))}
        <button onClick={flow.next} disabled={!flow.selectedReason}>Continue</button>
      </div>
    )
  }

  if (flow.step === 'offer' && flow.recommendation) {
    return (
      <div>
        <h2>{flow.recommendation.copy.headline}</h2>
        <button onClick={flow.accept}>Accept</button>
        <button onClick={flow.decline}>No thanks</button>
      </div>
    )
  }

  // ... feedback, confirm, success
}
```

The hook returns the current state (`step`, `reasons`, `recommendation`, `feedback`, `outcome`, `isProcessing`) and actions (`selectReason`, `next`, `back`, `accept`, `decline`, `cancel`, `close`).

## Add analytics

Create a free account at [churnkey.co](https://churnkey.co) and pass your app ID. The SDK records each session so you can see why customers cancel, which offers work, and what your save rate looks like.

```tsx
<CancelFlow
  appId="app_xxx"
  customer={{ id: 'cus_123' }}
  steps={steps}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

Only `customer.id` is required. For revenue metrics, pass subscription data too:

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

Your steps and callbacks don't change. No backend work required.

Sessions are recorded when the customer accepts an offer, confirms cancellation, or closes the modal before completing (abandoned). Data from custom steps passed via `onNext(result)` is captured alongside the session.

To keep staging traffic out of your production analytics, pass `mode="test"`:

```tsx
<CancelFlow
  appId="app_xxx"
  customer={{ id: 'cus_123' }}
  mode={process.env.NODE_ENV === 'production' ? 'live' : 'test'}
  steps={steps}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

Defaults to `'live'`. In token mode, the token's mode takes precedence — it's server-signed and can't be overridden client-side.

## Let Churnkey handle billing

Connect your billing provider (Stripe, Chargebee, etc.) in the Churnkey dashboard and Churnkey can apply discounts, pause subscriptions, and cancel on your behalf. Generate a token on your server to authenticate the session.

```typescript
// Server
import { Churnkey } from '@churnkey/node'

const ck = new Churnkey({ appId: 'app_xxx', apiKey: 'sk_xxx' })
const token = ck.createToken({ customerId: 'cus_123' })
```

```tsx
// Client
<CancelFlow
  appId="app_xxx"
  customer={{ id: 'cus_123', email: 'jane@acme.com' }}
  subscriptions={[...]}
  session={token}
  onAccept={async (offer) => console.log('Applied:', offer)}
  onCancel={async () => router.push('/goodbye')}
/>
```

In this mode, the cancel flow is configured from the Churnkey dashboard. Your theme, custom components, and appearance settings carry over.

You can pass both `session` and `steps` to override specific server config:

```tsx
<CancelFlow
  session={token}
  steps={[
    { type: 'confirm', title: 'We hate to see you go' },
    { type: 'nps', title: 'Quick question', data: { scale: 10 } },
  ]}
  customComponents={{ 'nps': NpsStep }}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

Local steps override by type. Steps not in the server config are appended.

## Imports

```tsx
import { CancelFlow } from '@churnkey/react'              // drop-in component
import { useCancelFlow } from '@churnkey/react/headless'   // headless hook
import { CancelFlowMachine } from '@churnkey/react/core'   // state machine, no React
```

## License

MIT
