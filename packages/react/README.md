# @churnkey/react

Drop-in cancel flow for React. Looks great out of the box, fully customizable, works with any billing system.

Free and open source. Optionally connects to [Churnkey](https://churnkey.co) for analytics and AI-powered retention.

## Install

```bash
npm install @churnkey/react
```

## Quick start

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

That's it. You get a modal with a survey, personalized offers, feedback collection, and a confirmation step. No account required, no data sent anywhere.

## Theming

Four built-in themes with dark mode support:

```tsx
<CancelFlow
  appearance={{ theme: 'minimal', colorScheme: 'dark' }}
  steps={steps}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

Override individual variables, or use `classNames` for Tailwind/CSS modules:

```tsx
<CancelFlow
  appearance={{ theme: 'rounded', variables: { colorPrimary: '#7c3aed' } }}
  classNames={{ modal: 'max-w-lg shadow-2xl' }}
  steps={steps}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

Themes: `default`, `minimal`, `rounded`, `corporate`. Each has light and dark variants.

## Component overrides

Replace any part of the UI while keeping the flow logic:

```tsx
<CancelFlow
  steps={steps}
  components={{
    ReasonButton: ({ reason, isSelected, onSelect }) => (
      <button
        onClick={() => onSelect(reason.id)}
        className={isSelected ? 'border-blue-500' : 'border-gray-200'}
      >
        {reason.label}
      </button>
    ),
  }}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

Overridable: `Modal`, `Header`, `Survey`, `Offer`, `Feedback`, `Confirm`, `Success`, `ReasonButton`, `OfferCard`, and all offer detail components.

## Custom steps and offers

The step system is open. Define any step type and register a component for it:

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

Custom steps navigate like built-in ones. Custom offers appear when a reason with that offer type is selected. Both record to analytics.

## Headless mode

Skip the UI entirely and build your own:

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

The hook gives you `step`, `reasons`, `recommendation`, `feedback`, `outcome`, `isProcessing`, and all the actions (`selectReason`, `next`, `back`, `accept`, `decline`, `cancel`, `close`).

## Add analytics

Sign up at [churnkey.co](https://churnkey.co), get an app ID, and add two props. The SDK starts recording sessions — you get cancel reason breakdowns, save rates, and offer effectiveness on the Churnkey dashboard.

```tsx
<CancelFlow
  appId="app_xxx"
  customer={{ id: 'cus_123' }}
  steps={steps}
  onAccept={handleOffer}
  onCancel={handleCancel}
/>
```

For revenue analytics, pass subscription data:

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

No backend changes. Your steps and callbacks stay the same.

## Let Churnkey handle billing

Generate a token on your server and Churnkey will apply discounts, pause subscriptions, and execute cancellations via your billing provider.

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

The flow config comes from the Churnkey dashboard. Your theme, component overrides, and custom steps still work.

## Imports

```tsx
import { CancelFlow } from '@churnkey/react'              // drop-in component
import { useCancelFlow } from '@churnkey/react/headless'   // headless hook
import { CancelFlowMachine } from '@churnkey/react/core'   // state machine (no React)
```

## License

MIT
