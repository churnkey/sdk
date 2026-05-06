# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Expect breaking changes in minor versions while we're pre-1.0.

## 0.1.0 — Unreleased

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
