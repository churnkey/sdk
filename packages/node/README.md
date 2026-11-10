# @churnkey/node

Server-side helper for Churnkey. Generate session tokens for `@churnkey/react` or HMAC hashes for the hosted embed, and send product usage events from your backend.

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

## Test and sandbox mode

Pass `mode: 'test'` to segregate staging or QA sessions from live analytics. Defaults to `'live'`.

```typescript
const token = ck.createToken({
  customerId: user.stripeId,
  mode: process.env.NODE_ENV === 'production' ? 'live' : 'test',
})
```

If your org is connected to a [Stripe Sandbox](https://docs.stripe.com/sandboxes) rather than classic test mode, pass `mode: 'sandbox'` instead. Sandboxes live under a separate Stripe account ID with their own credentials, and Churnkey routes billing actions accordingly.

## Track events

Send product usage events from your backend so Churnkey can tell active customers from quiet ones and measure activation and retention for each paying account.

```typescript
await ck.track({
  event: 'Job Scheduled',
  customerId: 'cus_123',
  properties: { plan: 'pro', jobs: 4 },
})
```

Name events in Title Case as object plus action: `'Job Scheduled'`, `'Report Exported'`. Identify the customer by `customerId` (your billing provider's ID), `uid` (the customer's ID in your own system), or both. For B2B products, pass `userUid` for the person acting inside the account.

`track` resolves once the API has accepted the event and rejects with a `ChurnkeyApiError` (with `status` and `body`) on a non-2xx response, or when the API answers `verified: false`, which means it did not accept the API key (wrong key, revoked, or for another mode).

Requests are rate limited. By default the limit is per IP address, 50 requests a minute, so a backend that calls `track` once per user action from one host will see 429s; batch with `trackBatch`, or ask support for a per-account limit (accounts with bulk events enabled get one). `track` does not retry; a 429 means slow down and send again.

Pass `timestamp` to record when an event happened rather than when it arrived. For backfills, `trackBatch` sends up to 100 events per request and splits larger arrays for you. The bulk endpoint is enabled per account; contact support to turn it on. Requests go in order, so if one fails the earlier ones are already stored: the error's `sent` is how many, so a retry can start from there.

```typescript
await ck.trackBatch(
  rows.map((row) => ({
    event: 'Job Completed',
    customerId: row.stripeCustomerId,
    timestamp: row.completedAt,
  })),
)
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

### `new Churnkey({ appId, apiKey, apiBase? })`

| Parameter | Description |
|-----------|-------------|
| `appId` | Your Churnkey app ID |
| `apiKey` | Your Churnkey API key. Keep this on the server. |
| `apiBase` | Optional. Base URL of the Churnkey API. Defaults to `https://api.churnkey.co`. |

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

### `ck.track({ event, customerId?, uid?, userUid?, properties?, timestamp? })`

| Parameter | Description |
|-----------|-------------|
| `event` | Event name in Title Case, e.g. `'Job Scheduled'` |
| `customerId` | The customer ID from your billing provider. Required unless `uid` is set. |
| `uid` | The customer's ID in your own system. Required unless `customerId` is set. |
| `userUid` | Optional. The person acting inside the account, for B2B products. |
| `properties` | Optional. Flat object of string, number, boolean or Date values. Up to 256 keys and 10 KB. |
| `timestamp` | Optional `Date`. When the event happened. Defaults to the time the server receives it. |

Returns a promise that resolves when the API accepts the event. Rejects with `ChurnkeyApiError` on a non-2xx response or a `verified: false` answer.

### `ck.trackBatch(events)`

Takes an array of the same parameters as `track` and posts them to the bulk endpoint in requests of up to 100. Every item is validated before the first request is sent. Requires bulk events to be enabled for your account. On failure the `ChurnkeyApiError` carries `sent`, the number of events already accepted.

## License

MIT
