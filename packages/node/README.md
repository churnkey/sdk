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

Name events in Title Case as object plus action: `'Job Scheduled'`, `'Report Exported'`. The API strips HTML from names and ids, so keep `<`, `>` and `&` out of them. Identify the customer by `customerId` (your billing provider's ID), `uid` (the customer's ID in your own system), or both. For B2B products, pass `userUid` for the person acting inside the account.

`track` resolves once the API has accepted the event and rejects with a `ChurnkeyApiError` on a non-2xx response, or when the API answers `verified: false`. That answer means the API stored the event but did not accept the key: wrong key, revoked, or a key for another mode. Construct the client with `mode: 'test'` for a test-mode key.

Event requests are limited to 50 a minute per IP address, so a backend that calls `track` once per user action from one host will see 429s. Accounts with bulk events enabled get 250 a minute per account instead, which applies only when the API key is accepted; ask support to enable it. `track` does not retry; a 429 means slow down and send again.

Pass `timestamp` to record when an event happened rather than when it arrived. For backfills, `trackBatch` sends up to 100 events per request and splits larger arrays for you. The bulk endpoint is enabled per account; contact support to turn it on. Requests go in order, so if one fails the earlier ones are already stored. The error's `sent` is how many events are known to be stored; the failing request may have stored its events too, so a retry from `sent` can send some events twice.

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

### `new Churnkey({ appId, apiKey, apiBase?, mode? })`

| Parameter | Description |
|-----------|-------------|
| `appId` | Your Churnkey app ID |
| `apiKey` | Your Churnkey API key. Keep this on the server. |
| `apiBase` | Optional. Base URL of the Churnkey API. Defaults to `https://api.churnkey.co`. |
| `mode` | Optional, `'live'`, `'test'` or `'sandbox'`. The mode the API key belongs to; `track` sends it with every event. Also the default `mode` for `createToken`. Defaults to `'live'`. |

### `ck.createToken({ customerId, subscriptionId?, mode? })`

| Parameter | Description |
|-----------|-------------|
| `customerId` | The customer ID from your billing provider (e.g. Stripe `cus_...`) |
| `subscriptionId` | Optional. Targets a specific subscription for customers with multiple. |
| `mode` | Optional, `'live'`, `'test'` or `'sandbox'`. Defaults to the client's `mode`. Sessions record this on the server for analytics segregation. |

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
| `properties` | Optional. Flat object of string, number, boolean or Date values (a Date is sent as an ISO string). Up to 256 keys and 10,000 characters of JSON. |
| `timestamp` | Optional `Date`. When the event happened. Defaults to the time the server receives it. |

Returns a promise that resolves when the API accepts the event. Rejects with `ChurnkeyApiError` on a non-2xx response, a `verified: false` answer, or a network failure (`status` 0, the underlying error as `cause`).

### `ck.trackBatch(events)`

Takes an array of the same parameters as `track` and posts them to the bulk endpoint in requests of up to 100. Every item is checked for `event` and `customerId` or `uid` before the first request is sent; the API's own limits (properties, name length) are checked per request. Requires bulk events to be enabled for your account.

### `ChurnkeyApiError`

Thrown by `track` and `trackBatch`.

| Property | Description |
|----------|-------------|
| `status` | The HTTP status. `200` when the API answered `verified: false`; `0` when the request got no answer (the network error is on `cause`). |
| `body` | The response body, trimmed. Empty when the server sent none. |
| `sent` | How many events the API is known to have stored: every event in a request that succeeded before this one, plus the events of a `verified: false` request, which the API stores anyway. The failing request may also have stored its events, so treat this as a floor. For `track` it is `0`, or `1` after `verified: false`. |

## License

MIT
