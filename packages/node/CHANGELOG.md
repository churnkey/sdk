# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Expect breaking changes in minor versions while we're pre-1.0.

## 0.1.0 — 2026-05-01

First public release.

### Added

- `Churnkey` class. Construct once with `{ appId, apiKey }` and reuse across requests.
- `ck.createToken({ customerId, subscriptionId?, mode? })` returns a `ck_`-prefixed session token for `<CancelFlow session={token} />`.
- `ck.authHash(customerId)` returns the raw HMAC-SHA256 hex string expected by the hosted embed (`churnkey.init({ authHash, ... })`). Same credentials as `createToken` — one client covers both surfaces.
- `mode: 'live' | 'test'` on `createToken` for analytics segregation; defaults to `'live'`.
- Ships ESM + CJS, type declarations, and source maps. Zero runtime dependencies — uses `node:crypto`.
