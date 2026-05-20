# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Expect breaking changes in minor versions while we're pre-1.0.

## 0.3.0 — Unreleased

### Added

- `aggregate_payment_recoveries` and `list_payment_recoveries` tools, backed by `/v1/data/warehouse/recovery-aggregation` and `/v1/data/warehouse/recoveries`. Aggregation returns count, invoice/recovered/pending/lost amounts in original currency and USD, with breakdowns by time, card brand, decline reason, outcome, blueprint, currency, and recovered/active state.
- Cancel-flow configuration tools: `list_blueprints`, `get_blueprint`, `update_blueprint_draft`, `publish_blueprint`, `list_segments`, and `reorder_segments`. Draft updates are kept separate from confirmed live-impacting publish/reorder actions, and the API writes audit logs for configuration changes.

### Changed

- `list_sessions` and `aggregate_sessions` now point at the new warehouse-backed routes (`/v1/data/warehouse/sessions` and `/v1/data/warehouse/session-aggregation`). The legacy `/v1/data/sessions` and `/v1/data/session-aggregation` routes are unchanged on the API side and continue to serve real-time Mongo data; the MCP just chooses the warehouse path because lag is acceptable for agent use cases and warehouse queries scale better. Tool descriptions surface the ~3-hour lag.

### Removed (BREAKING)

- `get_api_usage` tool. All remaining tools read from the warehouse; API request logs are not synced there. The `/v1/data/api-usage` REST endpoint is unchanged.

## 0.1.1 — 2026-05-06

### Fixed

- Bin no longer silently exits when invoked via `npx` or installed as a dependency. The 0.1.0 entrypoint relied on `process.argv[1] === fileURLToPath(import.meta.url)` to decide whether to start the server, but `npm`/`pnpm`/`yarn` install the bin as a symlink, so the comparison failed and `main()` never ran. Split into a dedicated `dist/bin.js` entry that always runs.

## 0.1.0 — 2026-05-06

First public release.

### Added

- MCP server (`npx -y @churnkey/mcp`) authenticating with a Churnkey Data API key (`x-ck-app` + `x-ck-api-key`).
- Read-only tools backed by `/v1/data/*`:
  - `list_sessions` — session-level detail with structured filters (enums for `saveType`/`offerType`/`billingInterval`, typed booleans/integers, ID lookups) and a `not` exclusion object for negation.
  - `aggregate_sessions` — counts grouped by one or more breakdown dimensions (time series via `day`/`week`/`month`/`invoiceMonth`).
  - `get_api_usage` — API call volume by date range.
- Compliance tools:
  - `dsr_access` — GDPR/CCPA right-to-know.
  - `dsr_delete` — GDPR/CCPA right-to-delete (destructive).
- Programmatic exports (`createServer`, `loadConfig`) for embedding the server in another Node process.
