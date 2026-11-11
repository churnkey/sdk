# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Expect breaking changes in minor versions while we're pre-1.0.

## Unreleased

### Added

- `ck.track({ event, customerId?, uid?, userUid?, properties?, timestamp? })` sends a product usage event to `POST /v1/api/events/new`. Rejects with `ChurnkeyApiError` (`status`, `body`, `sent`) on a non-2xx response, a `verified: false` answer (the API stored the event but did not accept the key), or a network failure (`status` 0, the original error on `cause`).
- `ck.trackBatch(events)` posts to the bulk endpoint in requests of up to 100. Bulk events have to be enabled for the account. A failed request rejects with the number of events known to be stored on `error.sent`, a floor: the failing request may have stored its events too.
- `apiBase` on the constructor, for pointing at a non-production API. Defaults to `https://api.churnkey.co`.
- `mode` on the constructor, the mode the API key belongs to. `track` sends it as `x-ck-mode`, so a test-mode key verifies. It is also the default `mode` for `createToken`, which still defaults to `'live'` when neither is set.
- `engines.node >= 18`, since `track` uses the global `fetch`.

## 0.2.0 — 2026-06-10

### Added

- `mode: 'sandbox'` on `createToken`, for orgs connected to a [Stripe Sandbox](https://docs.stripe.com/sandboxes) rather than classic test mode. Pair with `@churnkey/react` 0.6.0 or later — earlier versions of the react package treat unrecognized modes as `'live'`.

## 0.1.0 — 2026-05-01

First public release.

### Added

- `Churnkey` class. Construct once with `{ appId, apiKey }` and reuse across requests.
- `ck.createToken({ customerId, subscriptionId?, mode? })` returns a `ck_`-prefixed session token for `<CancelFlow session={token} />`.
- `ck.authHash(customerId)` returns the raw HMAC-SHA256 hex string expected by the hosted embed (`churnkey.init({ authHash, ... })`). Same credentials as `createToken` — one client covers both surfaces.
- `mode: 'live' | 'test'` on `createToken` for analytics segregation; defaults to `'live'`.
- Ships ESM + CJS, type declarations, and source maps. Zero runtime dependencies — uses `node:crypto`.
