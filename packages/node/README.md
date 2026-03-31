# @churnkey/node

Server-side SDK for [Churnkey](https://churnkey.co). Generate session tokens for use with `@churnkey/react`.

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

// Generate a token for a customer
const token = ck.createToken({ customerId: 'cus_123' })

// For multi-subscription customers, specify the subscription
const token = ck.createToken({
  customerId: 'cus_123',
  subscriptionId: 'sub_456',
})
```

Pass the token to your frontend and use it with `@churnkey/react`:

```tsx
<CancelFlow session={token} onAccept={...} onCancel={...} />
```

The token is a credential envelope (not a JWT). It authenticates the SDK to fetch config and execute actions via the Churnkey API. Token creation is a local HMAC computation — no API call.

## API

### `new Churnkey(config)`

- `config.appId` — Your Churnkey app ID
- `config.apiKey` — Your Churnkey API key (secret, server-side only)

### `ck.createToken(params)`

- `params.customerId` — The payment provider customer ID (e.g. Stripe `cus_...`)
- `params.subscriptionId` — (optional) Specific subscription ID for multi-sub customers

Returns a `ck_`-prefixed token string.

## License

MIT
