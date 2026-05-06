# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Expect breaking changes in minor versions while we're pre-1.0.

## 0.1.1 — Unreleased

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
