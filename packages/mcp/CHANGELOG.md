# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Expect breaking changes in minor versions while we're pre-1.0.

## 0.3.0 — Unreleased

### Added

- `aggregate_payment_recoveries` and `list_payment_recoveries` tools, backed by `/v1/data/warehouse/recovery-aggregation` and `/v1/data/warehouse/recoveries`. Aggregation returns count, invoice/recovered/pending/lost amounts in original currency and USD, with breakdowns by time, card brand, decline reason, outcome, blueprint, currency, and recovered/active state.
- Cancel-flow configuration tools: `list_blueprints`, `get_blueprint`, `update_blueprint_draft`, `update_blueprint_step`, `publish_blueprint`, `list_segments`, and `reorder_segments`. Draft updates are kept separate from confirmed live-impacting publish/reorder actions, sparse step edits avoid full `steps` payloads, and the API writes audit logs for configuration changes.
- Granular cancel-flow mutation tools: `update_blueprint_offer` (offer type + discount/pause/trial/redirect/plan-change config, addressable on a step, survey choice, or structured follow-up option), `edit_survey_structure` (`add_choice`/`remove_choice`/`reorder_choices`/`set_followup`), and `add_blueprint_step` / `remove_blueprint_step` (by canonical `place` / `stepGuid`). `update_blueprint_step` also gained survey behavior (`randomize`, `followupRequired`, `minLength`) and freeform/confirm config. All are draft-only and audit-logged; none require a `confirm` (publish remains the live gate).
- Discount offer custom amounts (`customAmount` + `customDuration`) are Paddle Classic-only; use `couponId` or `autoOptimize` for other providers.
- `CHURNKEY_USE_LOCAL_SERVER=true` switches the MCP server from production API to `http://localhost:3000/v1` when `CHURNKEY_API_URL` is not explicitly set.
- `update_blueprint_offer` supports cancel-flow rebate offers (`REBATE`) and `rebateConfig` fields: `amountType`, `customAmount`, `percentAmount`, `mbgWindowDays`, and `invoiceScope`.
- Segment mutation tools: `set_segment_enabled` (toggle a segment's live targeting) and `update_segment_filter` (replace audience rules). Both act on live config, so each requires a `confirm` literal and writes an audit log.
- `list_segment_attributes` returns the targetable audience-filter attributes — `builtIn` (the cancel-flow attribute palette, each with its `valueType`, applicable `operands`, and — for fixed-enum attributes like `BILLING_INTERVAL`/`SUBSCRIPTION_STATUS`/`SUBSCRIPTION_DISCOUNT` — the allowed `values` as `{ value, label }`, scoped to the org's payment provider) and `custom` (the org's own custom customer attributes). `update_segment_filter` validates enum values against this set, requiring the exact dashboard value (e.g. `MONTH`, not `month`) so segments render correctly in the dashboard builder. The palette mirrors the dashboard's cancel-flow builder; `update_segment_filter` rejects built-in attributes scoped to other products (e.g. `CUSTOMER_HAS_PHONE`, `INVOICE_AMOUNT_DUE`) so cancel-flow segments stay editable in the dashboard. Custom org attributes are always accepted.
- Cancel-flow creation tools: `create_blueprint` creates the default org draft when none exists, while `create_segment_flow` creates an isolated segment plus editable draft blueprint. Both support `empty`, `BASIC`, `B2B`, and `MERGEFIELDS` templates and require explicit confirmation. `archive_segment` soft-deletes disposable segment flows for cleanup.

### Changed

- Error messages from the Data API now surface to the agent. The server returns error bodies as plain text; the client previously only read a JSON `message` field and discarded them, so every validation/authorization failure showed as a generic `Churnkey API error <status>`. The client now relays the server's message verbatim and adds clearer fallbacks for 403/404.
- `list_blueprints` now returns every non-deleted segment flow (previously segments without a resolvable blueprint were dropped) and the default org flow always appears, matching the dashboard. Each flow gained a `hasUnpublishedChanges` boolean (draft edited since last publish). Tool/README copy no longer claims `status` exactly mirrors the dashboard badges — it is a documented coarse subset.
- `list_segments` now returns each segment's audience `filter` rules and a 0-based `priority` (replacing the vestigial, never-written `order` field), includes disabled segments, and drops the duplicate `_id` (use `id`).
- `publish_blueprint` no longer auto-enables a segment on its first publish. This mirrors the dashboard, which never changes a segment's enabled state on publish — segments default to enabled at creation, and `set_segment_enabled` toggles targeting independently. (Previously the Data API force-enabled on first publish, which could override an explicit `enabled: false`.)
- `update_segment_filter`'s `attribute` schema now documents the full catalog of built-in targeting attributes, grouped by value type and the operands that apply to each, so agents can discover what is targetable without an already-populated segment to copy from. Custom org-defined attributes remain accepted.
- `update_blueprint_draft` no longer accepts a full `steps` array on the Data API. Step content is mutated only via `update_blueprint_step`, which validates and clears stale translations. (Top-level draft fields: `name`, `brandImage`, `primaryColor`, `translatedLanguages`.)
- `brandImage` validation now mirrors the server (URL path must end in `.png`/`.jpg`/`.jpeg`/`.gif`/`.webp`, or be hosted on `images.churnkey.co`) instead of accepting any URL.
- Blueprint offer mutations and publish now enforce dashboard-like provider guardrails. Unsupported offer types are rejected for the org payment provider, and Braintree pause offers require the `CHURNKEY_PAUSE` discount before publish.
- Segment mutations now enforce dashboard-like lifecycle guardrails. Unfinished A/B test segments cannot be archived/toggled/filter-edited, and segment reorder keeps unfinished A/B test pairs together.
- `update_segment_filter` can edit the audience of a live (enabled + published) segment directly — matching the dashboard, which never required disabling first. Because the change takes effect immediately, the API requires an extra `confirmLiveChange: true` acknowledgment for live segments (it returns an instructive error if omitted). Disabled/unpublished segments are unaffected.
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
  - `aggregate_sessions` — counts grouped by one or more breakdown dimensions (time series via `day`/`week`/`month`).
  - `get_api_usage` — API call volume by date range.
- Compliance tools:
  - `dsr_access` — GDPR/CCPA right-to-know.
  - `dsr_delete` — GDPR/CCPA right-to-delete (destructive).
- Programmatic exports (`createServer`, `loadConfig`) for embedding the server in another Node process.
