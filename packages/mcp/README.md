# @churnkey/mcp

Model Context Protocol server for [Churnkey](https://churnkey.co). Lets AI agents (Claude Code, Cursor, Claude Desktop, etc.) read your sessions, run analytics queries, and handle GDPR requests.

## Tools

| Tool | Description |
|------|-------------|
| `get_account` | Identity & session context — call it first to orient: which workspace (org) the token acts on, the authenticated user, coarse entitlements (active subscription, Intelligence access), the granted OAuth scopes (so you know what's permitted), and the **effective mode** (live/test). No scope required. |
| `list_sessions` | Cancel/dunning sessions, with filters for date range, customer, outcome (saveType/canceled/aborted), plan, segment, A/B test, etc. Negation via `not: { ... }`. Default 50 / max 500 per call. |
| `aggregate_sessions` | Session counts, optionally grouped by `breakdownBy` dimensions (saveType, offerType, planId, day/week/month, …). Same filter set as `list_sessions`. |
| `aggregate_payment_recoveries` | Failed-payment recovery (dunning) counts and dollar amounts — invoice / recovered / pending / lost, in original currency and USD. Group by time, card brand, decline reason, outcome, blueprint, currency, recovered/active state. |
| `list_payment_recoveries` | Individual failed-payment recovery campaigns. Same filter set as the aggregation. |
| `get_flow_metrics` | Cancel flow performance: sessions, customers saved, save rate, boosted revenue (USD + per-currency), outcomes breakdown, sample-size warning, quotable `summary`, and Feedback AI themes (Intelligence plans). Scope by segment, published blueprint version (compare versions with two calls), or A/B test + date range. |
| `list_blueprints` | Current cancel flow inventory for the org: the default flow plus every non-deleted segment flow. Each flow has `status` (`active` / `setup_pending` / `inactive`), `published` and `hasUnpublishedChanges` booleans, `editableBlueprintId`, `publishedBlueprintId`, and compact `draft` / `publishedBlueprint` metadata. Status is a coarse subset of the dashboard badges; the "Unpublished Changes" badge is `status: "active"` + `hasUnpublishedChanges: true`. |
| `get_blueprint` | Full cancel flow blueprint by ID, including the `steps` array (each step/offer/survey-choice carries its `guid` for use with `update_blueprint_step`). Large for translated blueprints. |
| `update_blueprint_draft` | Draft-only updates for top-level blueprint fields (`name`, `brandImage`, `primaryColor`, `translatedLanguages`). Passing a published blueprint ID edits the corresponding working copy. Writes an audit log. |
| `update_blueprint_step` | Sparse draft step edits by `stepGuid` or `stepIndex`, without sending the full `steps` array — step/offer copy, `enabled`, and behavioral config (survey `randomize`/`followupRequired`/`minLength`, freeform/confirm config). Copy edits clear stale translations; publish refreshes translations. Writes an audit log. |
| `update_blueprint_offer` | Edit one offer's type and functional config (discount/pause/trial/redirect/plan-change) on a draft, by `stepGuid` (+ optional `choiceGuid`/`optionGuid`). Writes an audit log. |
| `edit_survey_structure` | Add/remove/reorder survey choices and configure follow-ups (`add_choice`/`remove_choice`/`reorder_choices`/`set_followup`) on a draft survey step. Writes an audit log. |
| `add_blueprint_step` / `remove_blueprint_step` | Add a step at a canonical `place` (server builds the base step) or remove one by `stepGuid` on a draft. Writes an audit log. |
| `publish_blueprint` | Publish a draft blueprint as the live org/segment version. Requires `confirm: "publish"` and writes an audit log. |
| `list_segments` | Cancel flow segment metadata in priority order (response order = priority; `priority` is the 0-based index). Includes disabled segments (`enabled` flag) and each segment's audience `filter` rules. A/B variant segments appear as separate entries. |
| `reorder_segments` | Reorder cancel flow segment priority. Requires `confirm: "reorder_segments"` and writes an audit log. |
| `set_segment_enabled` | Enable/disable a segment (live targeting on/off). Requires `confirm: "set_segment_enabled"` and writes an audit log. |
| `update_segment_filter` | Replace a segment's audience filter rules (whole-array replace). Requires `confirm: "update_segment_filter"` and writes an audit log. |
| `get_stripe_settings` / `update_stripe_settings` | Read (with descriptions + recommendations) and change workspace billing settings: proration, cancellation timing, pause behavior, invoice handling on pause, coupon stacking, session recording. Writes require `confirm: "update_stripe_settings"`, validate conflicting combinations with explanations, and are audit-logged with before/after values. *Direct revenue impact.* |
| `get_adaptive_offers` / `update_adaptive_offers` | Read and configure adaptive (auto-optimized) discounts: strategy, percent/duration ranges, Intelligence access state. Changes reset the optimizer's learning period; writes require `confirm: "update_adaptive_offers"`. Attaching to a flow step (via `update_blueprint_offer` `config.autoOptimize`) requires both the adaptive-offers and blueprints write scopes. |
| `list_recovery_blueprints` / `get_recovery_blueprint` / `clone_recovery_blueprint` / `update_recovery_email` / `publish_recovery_blueprint` | Payment recovery campaign config CRUD: list/read full email sequences (cadence, sender, copy), clone as the template-library path, patch single emails (CTA + merge-tag validation, dashboard length limits, deliverability warnings on sender changes), publish (rebuilds pending sends on in-flight sequences; `confirm` required). Scopes `payment_recovery.blueprints.read/.write`. |
| `update_recovery_email_offers` / `update_recovery_sms` / `add_recovery_email` / `remove_recovery_email` / `update_recovery_audience` / `list_recovery_audience_attributes` / `set_recovery_blueprint_enabled` | Full dashboard parity for recovery campaign editing: per-email offers (coupon + one-time invoice discount, CTA auto-fill, mirrored to the paired SMS), SMS editing (org feature gate, 160-char segment cap, merge-field validation, both-channels-disabled guard), sequence steps (add inherits the last step a day later with its SMS companion; remove is confirm-gated), audience rename/filters against the dunning attribute palette (A/B-test locked), and the confirm-gated on/off toggle that saves + publishes in one step like the dashboard. Exclusion lists and one-time `sendOnDate` sends remain dashboard-only for now. |
| `list_recovery_campaigns` / `get_recovery_campaign_messages` / `get_recovery_engagement` / `stop_recovery_campaign` | Running per-customer sequences: who's in which step, sends/opens/clicks per message, per-email engagement rates, and the irreversible `stop_campaign` interrupt (confirm + audit reason). Customer identity needs `payment_recovery.campaigns.read_pii`. |
| `get_dns_config` / `set_hosted_subdomain` / `add_custom_domain` / `check_domain_status` / `remove_custom_domain` | Hosted-page domain setup: read current state, set the churnkey.co subdomain (live instantly), register custom domains idempotently with the exact DNS records the customer must add on their side, poll propagation/SSL status, and deregister. Scopes `dns.read` / `dns.write`. |
| `list_ab_tests` / `create_ab_test` / `start_ab_test` / `pause_ab_test` / `complete_ab_test` / `get_ab_test_metrics` / `pick_ab_test_winner` | Full A/B test lifecycle: clone a segment flow as the variant, edit it with the blueprint tools, start/pause, read per-arm metrics with statistical significance (n≥30 per arm), and pick the winner (commits the variant to 100% of matched traffic; early decisions need an explicit acknowledgement). Two-arm, implicit 50/50 split. Scopes `ab_test.read` / `ab_test.write`. |
| `get_audit_log` | The workspace audit trail: every config change, publish, A/B decision, consent and MCP session read — attributed to user/source/client/scopes, with quotable summaries and before/after values. Filter by source (`mcp-oauth` = agent actions), event name, date range. Scope `account.audit_log.read` (owner/admin). |
| `dsr_access` | GDPR/CCPA data access by email. |
| `dsr_delete` | GDPR/CCPA data delete by email. *Destructive.* |

Session and recovery tools read from the Churnkey analytics warehouse — sessions refresh every ~3 hours, recoveries every ~20 minutes. DSR tools read/write the operational store directly (no lag).

Blueprint edits are **granular and draft-only**: each tool mutates the unlocked working copy and sends only the targeted fields (never the full `steps` array with translations). `update_blueprint_step` handles copy + behavioral flags, `update_blueprint_offer` handles offer config, `edit_survey_structure` handles survey choices/follow-ups, and `add_blueprint_step`/`remove_blueprint_step` handle step structure. Copy edits clear stale translations for the affected content; `publish_blueprint` refreshes translations before making the draft live and is the only live-impacting blueprint action (so it's the one that requires a `confirm`).

Segment tools (`reorder_segments`, `set_segment_enabled`, `update_segment_filter`) act on **live** config directly (segments have no draft cycle), so each requires an explicit `confirm` literal and writes an audit log.

Each tool's input schema is fully described to the MCP client — enums for `saveType` / `offerType` / `billingInterval` / breakdown dimensions, `not` object for exclusions, structured types for booleans and numbers.

Mode (live vs test): with OAuth, set `CHURNKEY_MODE=test` (sent as `x-ck-mode: test`); with a deprecated Data API key, mode comes from the key prefix (`test_…`). Mode defaults to **live**, and `get_account` reports the effective mode for the session.

Mode applies to **session analytics only** (`list_sessions` / `aggregate_sessions` — the only surface partitioned by test/live, so those two tools echo the active mode in their results). Everything else is mode-independent: **blueprint / segment / recovery configuration is shared across modes** (not key-dependent); **payment-recovery analytics are not partitioned by mode** (dunning campaigns come from real provider failed-payment events and carry no test/live distinction); `get_flow_metrics` is live-mode by definition (it joins real invoices); and DSR looks up a customer by email across the whole workspace regardless of mode.

## Authentication

`@churnkey/mcp` 1.0 authenticates **per user via OAuth 2.1** (authorization code + PKCE). Each MCP action runs as your Churnkey user, inherits your workspace role, and is recorded in the audit log under your name. A workspace admin must enable MCP access for your user first (Churnkey → Team).

```bash
npx @churnkey/mcp auth login     # opens the browser, shows the consent screen, stores tokens locally
npx @churnkey/mcp auth status    # who am I / which scopes were granted
npx @churnkey/mcp auth logout    # revokes the session server-side and deletes local tokens
```

Tokens are stored in `~/.churnkey/mcp-auth.json` (override the directory with `CHURNKEY_CONFIG_DIR`), chmod 600. Access tokens last ~1 hour and refresh automatically; refresh tokens rotate on every use.

The consent screen lets you narrow the granted scopes: every scope within your role's ceiling is pre-checked, PII scopes carry an explicit warning, and you can uncheck anything before approving. Request a custom subset up front with `npx @churnkey/mcp auth login --scopes cancel_flows.blueprints.read,cancel_flows.metrics.read`.

### Data API keys (deprecated for MCP)

`CHURNKEY_APP_ID` + `CHURNKEY_API_KEY` still work for **read-only** data access, but the API rejects configuration writes (blueprint/segment edits, publish) without OAuth, and the server prints a deprecation warning. Data API keys remain fully supported for non-MCP server-to-server use (`/v1/data/*` from your own backend).

## Transports

The package supports two transports:

- **stdio** (default): local MCP clients run `npx -y @churnkey/mcp`; auth comes from the stored OAuth session (`npx @churnkey/mcp auth login`).
- **Streamable HTTP** (opt-in): run the same server behind a single HTTP endpoint, usually `/mcp`.

For a public Churnkey-hosted endpoint, the recommended shape is:

- `https://mcp.churnkey.co` — public docs / onboarding site.
- `https://mcp.churnkey.co/mcp` — Streamable HTTP MCP endpoint.

That keeps the human site and protocol endpoint on one memorable domain without making the root URL a machine-only route.

## Setup

1. Ask a workspace admin to enable **MCP access** for your user (Churnkey → Team). Don't have an account? [Create one](https://app.churnkey.co/register?intent=sdk).
2. Sign in once: `npx @churnkey/mcp auth login`
3. Add the server to your MCP client config — no credentials needed in the config.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "churnkey": {
      "command": "npx",
      "args": ["-y", "@churnkey/mcp"]
    }
  }
}
```

Fully quit and reopen the app for the server to load.

### Claude Code

Easiest — register from the CLI:

```bash
npx @churnkey/mcp auth login
claude mcp add churnkey -- npx -y @churnkey/mcp
```

Alternatively, add the server to `~/.claude.json` (global, all projects) or to `.mcp.json` in your project root (project-scoped, can be checked into git). The block has the same shape as the Claude Desktop config above.

Restart your Claude Code session to pick up the new server.

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "churnkey": {
      "command": "npx",
      "args": ["-y", "@churnkey/mcp"]
    }
  }
}
```

Restart the client after editing config.

## Environment variables

| Var | Required | Default |
|-----|----------|---------|
| `CHURNKEY_API_URL` | no | `https://api.churnkey.co/v1` |
| `CHURNKEY_MODE` | no | `live` (`test` queries test-mode data over OAuth) |
| `CHURNKEY_CONFIG_DIR` | no | `~/.churnkey` (token storage) |
| `CHURNKEY_APP_ID` | deprecated | — (Data API key auth only) |
| `CHURNKEY_API_KEY` | deprecated | — (read-only; use `auth login` instead) |

With deprecated key auth, use a `test_`-prefixed API key for staging data.

## Local API testing

When testing against a local `churnkey-api` server, start the API on port 3000, sign in against it, then run the server:

```bash
CHURNKEY_API_URL=http://localhost:3000/v1 npx @churnkey/mcp auth login
pnpm local-run
```

The command builds `@churnkey/mcp` and starts the MCP server over stdio using the stored OAuth session (the stored session pins the API base URL it was issued by). The legacy flags still work for deprecated read-only key auth: `pnpm local-run --app-id your_app_id --api-key test_data_your_key`.

For MCP client configs, point the client directly at the built server:

```json
{
  "mcpServers": {
    "churnkey-local": {
      "command": "node",
      "args": ["/Users/ig/Documents/Churnkey/sdk/packages/mcp/dist/bin.js"]
    }
  }
}
```

### HTTP transport variables

| Var | Required | Default |
|-----|----------|---------|
| `CHURNKEY_MCP_TRANSPORT` | no | `stdio` |
| `CHURNKEY_MCP_HOST` | no | `127.0.0.1` |
| `CHURNKEY_MCP_PORT` | no | `3333` |
| `CHURNKEY_MCP_PATH` | no | `/mcp` |
| `CHURNKEY_MCP_ALLOWED_HOSTS` | no | — |
| `CHURNKEY_MCP_CORS_ORIGIN` | no | — |
| `CHURNKEY_MCP_PUBLIC_URL` | no | `http://<host>:<port>` |

`CHURNKEY_MCP_PUBLIC_URL` is the canonical public URL of the HTTP endpoint (e.g. `https://mcp.churnkey.co`). The server advertises it as the OAuth resource identifier: `GET /.well-known/oauth-protected-resource` returns RFC 9728 metadata pointing at the Churnkey API's authorization server, and unauthenticated requests get a `WWW-Authenticate: Bearer resource_metadata="…"` header — so OAuth-capable MCP clients (Claude, etc.) can discover and run the sign-in flow themselves when connecting to a hosted endpoint.

`CHURNKEY_MCP_ALLOWED_HOSTS` is a comma-separated list of accepted `Host` headers, including ports when present (for example, `mcp.churnkey.co,localhost:3333`). `CHURNKEY_MCP_CORS_ORIGIN` is intentionally opt-in; set it to one exact browser origin, or `*`, only when a browser-based MCP client needs CORS.

## Streamable HTTP

Start the HTTP server after building:

```bash
pnpm --filter @churnkey/mcp build
pnpm --filter @churnkey/mcp start:http
```

By default this listens on `http://127.0.0.1:3333/mcp`. You can also run the built binary directly:

```bash
CHURNKEY_MCP_TRANSPORT=http node packages/mcp/dist/bin.js
node packages/mcp/dist/bin.js --http
node packages/mcp/dist/bin.js --transport=http
```

For a shared or hosted HTTP endpoint, credentials are sent on the initialization request instead of read from environment variables. The primary scheme is a Churnkey MCP **OAuth access token**:

```bash
curl http://127.0.0.1:3333/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer ck_oat_…' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0.1.0"}}}'
```

Add `x-ck-mode: test` to query test-mode data. Deprecated read-only Data API key auth is still accepted per request via `x-ck-app` + `x-ck-api-key` (or a non-`ck_oat_` bearer value as the key).

## Programmatic use

You can also embed the server in another Node process:

```ts
import { createServer, loadConfig } from '@churnkey/mcp'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = createServer(loadConfig())
await server.connect(new StdioServerTransport())
```

## License

MIT
