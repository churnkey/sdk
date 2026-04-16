# @churnkey/node

Server-side token generation for [Churnkey](https://churnkey.co). Lets Churnkey execute billing actions (apply discounts, pause subscriptions, cancel) on behalf of your customers.

You only need this package if you want Churnkey to handle billing operations. For analytics-only, `@churnkey/react` works without a token.

## Install

```bash
npm install @churnkey/node
```

## Usage

```typescript
import { Churnkey } from '@churnkey/node'

const ck = new Churnkey({
  appId: process.env.CHURNKEY_APP_ID,
  apiKey: process.env.CHURNKEY_API_KEY,
})

const token = ck.createToken({ customerId: 'cus_123' })
```

Pass the token to your frontend:

```tsx
<CancelFlow
  appId="app_xxx"
  customer={{ id: 'cus_123', email: 'jane@acme.com' }}
  session={token}
  onAccept={async (offer) => console.log('Applied:', offer)}
  onCancel={async () => router.push('/goodbye')}
/>
```

For multi-subscription customers:

```typescript
const token = ck.createToken({
  customerId: 'cus_123',
  subscriptionId: 'sub_456',
})
```

Token creation is a local HMAC computation. No API call, no latency.

## API

### `new Churnkey({ appId, apiKey })`

| Param | Description |
|-------|-------------|
| `appId` | Your Churnkey app ID |
| `apiKey` | Your Churnkey API key (secret — server-side only) |

### `ck.createToken({ customerId, subscriptionId? })`

| Param | Description |
|-------|-------------|
| `customerId` | Payment provider customer ID (e.g. Stripe `cus_...`) |
| `subscriptionId` | Optional. Targets a specific subscription for multi-sub customers. |

Returns a `ck_`-prefixed token string.

## License

MIT
