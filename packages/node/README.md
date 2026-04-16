# @churnkey/node

Generate session tokens for `@churnkey/react`. A token lets Churnkey apply discounts, pause subscriptions, and execute cancellations through your billing provider.

You only need this package when you want Churnkey to handle billing operations. For analytics-only integration, `@churnkey/react` works without a token.

## Installation

```bash
npm install @churnkey/node
```

## Generate a token

```typescript
import { Churnkey } from '@churnkey/node'

const ck = new Churnkey({
  appId: process.env.CHURNKEY_APP_ID,
  apiKey: process.env.CHURNKEY_API_KEY,
})

const token = ck.createToken({ customerId: 'cus_123' })
```

Pass it to the frontend:

```tsx
<CancelFlow
  appId="app_xxx"
  customer={{ id: 'cus_123', email: 'jane@acme.com' }}
  session={token}
  onAccept={async (offer) => console.log('Applied:', offer)}
  onCancel={async () => router.push('/goodbye')}
/>
```

Token creation is a local HMAC computation. No network call, no latency.

## Multi-subscription customers

Target a specific subscription:

```typescript
const token = ck.createToken({
  customerId: 'cus_123',
  subscriptionId: 'sub_456',
})
```

## Reference

### `new Churnkey({ appId, apiKey })`

| Parameter | Description |
|-----------|-------------|
| `appId` | Your Churnkey app ID |
| `apiKey` | Your Churnkey API key. Keep this on the server. |

### `ck.createToken({ customerId, subscriptionId? })`

| Parameter | Description |
|-----------|-------------|
| `customerId` | The customer ID from your billing provider (e.g. Stripe `cus_...`) |
| `subscriptionId` | Optional. Targets a specific subscription for customers with multiple. |

Returns a `ck_`-prefixed token string.

## License

MIT
