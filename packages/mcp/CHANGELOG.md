# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.1.1 — 2026-07-30

### Fixed

- Hosted HTTP transport: the OAuth bearer token is now read from every request instead of being captured once on `initialize` and reused for the life of the session. A session pinned to an expired access token kept failing even after the client sent a refreshed one, so hosted connectors stopped working an hour after connecting and only recovered when the user re-authorized. The transport is now stateless (no `Mcp-Session-Id`), which also removes the per-session server accumulation and the sticky-routing requirement. Clients connected before the upgrade migrate without reconnecting — an unrecognized session id is ignored rather than rejected.
- Only a genuine missing-credentials failure answers `401` with `WWW-Authenticate`; other errors now answer `500`. The previous catch-all returned `401` for any thrown error, which told OAuth clients their token was invalid when it was fine.
- The `401` hint for hosted bearer tokens no longer suggests running `npx @churnkey/mcp auth login`. That path has no local token store, so the advice was not actionable and pushed connector users into re-authorizing by hand.

Local stdio users were unaffected by all three — that path refreshes its own token and retries on `401`.

## 1.1.0 — 2026-07-15

### Added

- Rebate offers in `update_blueprint_offer`, with fixed or percentage amounts, currency-specific `fixedAmounts`, money-back guarantee windows, and invoice scope. Fixed rebate amounts are validated as non-negative minor units with unique three-letter currency codes.
- Restored blueprint and segment tools dropped during the MCP reslice: `create_blueprint` (default organization flow with `empty`/`BASIC`/`B2B`/`MERGEFIELDS` templates), `create_segment_flow` (segment plus editable draft), `archive_segment`, and `list_segment_attributes` (targetable attributes with value types, valid operands, and fixed-enum values).

### Changed

- `update_segment_filter` accepts the API-required `confirmLiveChange` acknowledgement when editing the audience of a live segment.
- Segment audience operands now match the Data API. String and boolean attributes use `INCLUDES`/`NOT_INCLUDES`; number and date attributes use `GTE`/`LTE`/`BETWEEN`/`NOT_BETWEEN`. Removed `GT`/`LT`, which the API rejects.

## 1.0.0 — 2026-07-02

### Added

- `get_account` tool (no scope required): identity & session-context preflight — the acting workspace (org), authenticated user, coarse entitlements (active subscription, Intelligence access), granted OAuth scopes, and the **effective live/test mode**. Agents are nudged to call it first to confirm which org and mode they're operating in (and to read their scopes before hitting a guaranteed 403). Backed by the new `GET /v1/data/account`.
- Effective-mode visibility: `list_sessions` / `aggregate_sessions` now append the active mode (`Mode: LIVE|TEST`) to their results and carry a mode-sensitivity note in their descriptions — they're the only mode-partitioned surface, so an agent never has to infer live-vs-test from empty data. Configuration, payment-recovery analytics, flow metrics, and DSR are mode-independent and are documented as such.

- Payment recovery dashboard parity (XDEV-2332 follow-up): `update_recovery_email_offers` (one DISCOUNT coupon + one INVOICE_DISCOUNT per email, null removes, CTA text auto-fills/resets and offers mirror to the paired SMS exactly like the dashboard), `update_recovery_sms` (org SMS feature gate, 160-text-char cap, dunning merge-field validation, magic-link warning, shared-schedule propagation to the paired email), `add_recovery_email` / `remove_recovery_email` (steps are email+SMS pairs sharing a guid; add inherits the last step one day later; remove is confirm-gated and keeps ≥1 step), `update_recovery_audience` + `list_recovery_audience_attributes` (rename + filter rules validated against the dunning palette incl. decline type/reason and payment-method category; filter edits blocked during an active A/B test), and `set_recovery_blueprint_enabled` (confirm-gated; saves **and** publishes in one step, matching the dashboard toggle). `update_recovery_email` now enforces the dashboard editor's length limits server-side and propagates `sendOnDay`/`timeToSend` to the paired SMS. Deferred (dashboard-only for now): exclusion lists, one-time `sendOnDate` sends.
- `get_audit_log` tool (scope `account.audit_log.read`, owner/admin ceiling): the attributed workspace audit trail with per-entry summaries, source filtering (agent vs dashboard actions), and before/after diffs — backed by the new `GET /v1/data/audit-log`.
- A/B test suite tools (XDEV-2333; scopes `ab_test.read/.write`): `create_ab_test` clones a segment flow as the editable variant, `start/pause/complete_ab_test` drive the lifecycle, `get_ab_test_metrics` returns per-arm performance + significance (n≥30 rule surfaced), and `pick_ab_test_winner` is confirm-gated, audit-logged with `action: pick_winner`, disables the losing arm, and refuses pre-enrollment-window decisions without `acknowledgeEarlyDecision`. Two-arm/implicit-50-50 documented as a hard limit.
- Payment recovery campaign tools (XDEV-2332): blueprint config CRUD (`list/get_recovery_blueprint`, `clone_recovery_blueprint` as the template-library path, `update_recovery_email` with CTA/merge-tag validation and sender-change deliverability warnings, confirm-gated `publish_recovery_blueprint` that rebuilds pending sends on in-flight sequences), running-instance visibility (`list_recovery_campaigns`, `get_recovery_campaign_messages`, `get_recovery_engagement` open/click rates), and the irreversible `stop_recovery_campaign` interrupt with audit reason. New scopes: `payment_recovery.blueprints.read/.write`, `payment_recovery.campaigns.read/.read_pii`; `.campaigns.write` now covers interrupts.
- DNS setup tools (`get_dns_config`, `set_hosted_subdomain`, `add_custom_domain`, `check_domain_status`, `remove_custom_domain`; scopes `dns.read/.write`): idempotent registration, the exact customer-side DNS records in every response, propagation polling with human-readable next steps, and an explicit "the records live at the customer's DNS provider" boundary in the tool prompts. XDEV-2330.
- Stripe settings tools (`get_stripe_settings` / `update_stripe_settings`, scopes `stripe_settings.read/.write`): every setting ships with an LLM-readable description + recommendation; writes require a confirm literal, explain conflicting combinations (e.g. `pauseEndOfTerm` × `annualPauseExtendTerm`), and audit-log before/after values. XDEV-2336.
- Adaptive offers tools (`get_adaptive_offers` / `update_adaptive_offers`, scopes `cancel_flows.adaptive_offers.read/.write`): strategy presets (conservative/balanced/aggressive), 5–95%-in-5%-steps guardrails, Intelligence gating, learning-period warnings, and a compound-scope rule — attaching an adaptive offer to a flow step via `update_blueprint_offer` requires `cancel_flows.adaptive_offers.write` **and** `cancel_flows.blueprints.write`. XDEV-2335.
- `get_flow_metrics` tool: per-flow performance metrics (total sessions, customers saved, save rate, boosted revenue in USD + per-currency, session outcomes by offer type, Intelligence-gated Feedback AI themes) scoped by segment, published blueprint version, or A/B test, with date-range windowing. Includes a `sampleSizeWarning` for small windows and a one-line `summary` for quoting. Backed by the new `GET /v1/data/flow-metrics` endpoint (`cancel_flows.metrics.read`).
- Session reads over OAuth now write a per-call audit entry (actor, client, scopes used, session count, redaction state) per the XDEV-2338 spec.

- **Per-user OAuth 2.1 authentication** (authorization code + PKCE, S256). New CLI: `npx @churnkey/mcp auth login` opens the browser, walks the Churnkey consent screen (scopes pre-checked within your role ceiling, PII scopes flagged, uncheck anything), and stores tokens in `~/.churnkey/mcp-auth.json` (chmod 600, `CHURNKEY_CONFIG_DIR` to relocate). `auth status` and `auth logout` (logout revokes the server-side grant via RFC 7009) included. `--scopes a,b` narrows the requested scopes.
- Access tokens (~1h) refresh automatically with refresh-token rotation; a 401 mid-session triggers one transparent refresh + retry. Revocation (dashboard "Active MCP sessions", admin disable, `auth logout`) takes effect immediately.
- Every MCP action is now attributable: the API audit log records the acting user, client, and scope for configuration writes made over OAuth.
- `CHURNKEY_MODE=test` (or `x-ck-mode: test` per HTTP request) selects test-mode data over OAuth — with key auth, mode stays encoded in the key prefix.
- Streamable HTTP transport accepts `Authorization: Bearer <ck_oat_…>` OAuth access tokens per request — no app id required; user, org, and scopes resolve from the token.
- Streamable HTTP transport implements MCP-spec OAuth discovery: `GET /.well-known/oauth-protected-resource` (RFC 9728, resource = `CHURNKEY_MCP_PUBLIC_URL`, authorization server = the Churnkey API origin) and a `WWW-Authenticate: Bearer resource_metadata="…"` header on 401s, so OAuth-capable MCP clients can run the sign-in flow themselves against a hosted endpoint.

### Changed (BREAKING)

- **The Data API key is no longer the MCP authentication mechanism.** `CHURNKEY_APP_ID`/`CHURNKEY_API_KEY` continue to work for read-only data tools (with a deprecation warning), but the API rejects configuration writes (blueprint/segment edits, publish, etc.) without an OAuth user session. Data API keys are unaffected for non-MCP server-to-server `/v1/data/*` use.
- A user must have MCP access enabled by a workspace admin (Churnkey → Team) before `auth login` will issue tokens.
- 401 handling distinguishes auth schemes: descriptive server messages (e.g. "this operation requires OAuth") surface verbatim; bare unauthorized bodies map to a sign-in hint for the active scheme.

## 0.3.0 — 2026-05-07

### Added

- `aggregate_payment_recoveries` and `list_payment_recoveries` tools, backed by `/v1/data/warehouse/recovery-aggregation` and `/v1/data/warehouse/recoveries`. Aggregation returns count, invoice/recovered/pending/lost amounts in original currency and USD, with breakdowns by time, card brand, decline reason, outcome, blueprint, currency, and recovered/active state.
- Cancel-flow configuration tools: `list_blueprints`, `get_blueprint`, `update_blueprint_draft`, `update_blueprint_step`, `publish_blueprint`, `list_segments`, and `reorder_segments`. Draft updates are kept separate from confirmed live-impacting publish/reorder actions, sparse step edits avoid full `steps` payloads, and the API writes audit logs for configuration changes.
- Granular cancel-flow mutation tools: `update_blueprint_offer` (offer type + discount/pause/trial/redirect/plan-change config, addressable on a step, survey choice, or structured follow-up option), `edit_survey_structure` (`add_choice`/`remove_choice`/`reorder_choices`/`set_followup`), and `add_blueprint_step` / `remove_blueprint_step` (by canonical `place` / `stepGuid`). `update_blueprint_step` also gained survey behavior (`randomize`, `followupRequired`, `minLength`) and freeform/confirm config. All are draft-only and audit-logged; none require a `confirm` (publish remains the live gate).
- Segment mutation tools: `set_segment_enabled` (toggle a segment's live targeting) and `update_segment_filter` (replace audience rules). Both act on live config, so each requires a `confirm` literal and writes an audit log.

### Changed

- Error messages from the Data API now surface to the agent. The server returns error bodies as plain text; the client previously only read a JSON `message` field and discarded them, so every validation/authorization failure showed as a generic `Churnkey API error <status>`. The client now relays the server's message verbatim and adds clearer fallbacks for 403/404.
- `list_blueprints` now returns every non-deleted segment flow (previously segments without a resolvable blueprint were dropped) and the default org flow always appears, matching the dashboard. Each flow gained a `hasUnpublishedChanges` boolean (draft edited since last publish). Tool/README copy no longer claims `status` exactly mirrors the dashboard badges — it is a documented coarse subset.
- `list_segments` now returns each segment's audience `filter` rules and a 0-based `priority` (replacing the vestigial, never-written `order` field), includes disabled segments, and drops the duplicate `_id` (use `id`).
- `update_blueprint_draft` no longer accepts a full `steps` array on the Data API. Step content is mutated only via `update_blueprint_step`, which validates and clears stale translations. (Top-level draft fields: `name`, `brandImage`, `primaryColor`, `translatedLanguages`.)
- `brandImage` validation now mirrors the server (URL path must end in `.png`/`.jpg`/`.jpeg`/`.gif`/`.webp`, or be hosted on `images.churnkey.co`) instead of accepting any URL.
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
