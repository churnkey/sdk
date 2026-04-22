# @churnkey/node

Server-side helper for Churnkey auth. Generate session tokens for `@churnkey/react`, or HMAC hashes for the hosted embed — same credentials, different wire shapes.

You only need this package when you want Churnkey to handle billing operations or when you're using the hosted embed. For analytics-only integration with `@churnkey/react`, a token isn't required.

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

## Test mode

Pass `mode: 'test'` to segregate staging or QA sessions from live analytics. Defaults to `'live'`.

```typescript
const token = ck.createToken({
  customerId: user.stripeId,
  mode: process.env.NODE_ENV === 'production' ? 'live' : 'test',
})
```

## Using the hosted embed instead

If you're using the hosted widget (script tag `churnkey.init({...})`) alongside or instead of the React SDK, it expects a raw HMAC hash rather than a session token. Same credentials, different wrapper:

```typescript
const authHash = ck.authHash(user.stripeId)

// Pass to the embed on the client
// churnkey.init({ appId, customerId: user.stripeId, authHash })
```

You can use one `Churnkey` instance for both — no need to duplicate HMAC plumbing.

## Reference

### `new Churnkey({ appId, apiKey })`

| Parameter | Description |
|-----------|-------------|
| `appId` | Your Churnkey app ID |
| `apiKey` | Your Churnkey API key. Keep this on the server. |

### `ck.createToken({ customerId, subscriptionId?, mode? })`

| Parameter | Description |
|-----------|-------------|
| `customerId` | The customer ID from your billing provider (e.g. Stripe `cus_...`) |
| `subscriptionId` | Optional. Targets a specific subscription for customers with multiple. |
| `mode` | Optional, `'live'` or `'test'`. Defaults to `'live'`. Sessions record this on the server for analytics segregation. |

Returns a `ck_`-prefixed token string.

### `ck.authHash(customerId)`

| Parameter | Description |
|-----------|-------------|
| `customerId` | The customer ID you'll pass to the hosted embed. |

Returns the hex HMAC-SHA256 string expected by `churnkey.init({ authHash, ... })`. Use this when you're integrating the hosted embed widget directly instead of (or alongside) the React SDK.

## License

MIT
