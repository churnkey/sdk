# @churnkey/mcp

Model Context Protocol server for [Churnkey](https://churnkey.co). Lets AI agents (Claude Code, Cursor, Claude Desktop, etc.) read your sessions, run analytics queries, and handle GDPR requests.

## Tools

| Tool | Description |
|------|-------------|
| `list_sessions` | Cancel/dunning sessions, with filters for date range, customer, outcome (saveType/canceled/aborted), plan, segment, A/B test, etc. Negation via `not: { ... }`. Default 50 / max 500 per call. |
| `aggregate_sessions` | Session counts, optionally grouped by `breakdownBy` dimensions (saveType, offerType, planId, day/week/month, …). Same filter set as `list_sessions`. |
| `aggregate_payment_recoveries` | Failed-payment recovery (dunning) counts and dollar amounts — invoice / recovered / pending / lost, in original currency and USD. Group by time, card brand, decline reason, outcome, blueprint, currency, recovered/active state. |
| `list_payment_recoveries` | Individual failed-payment recovery campaigns. Same filter set as the aggregation. |
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
| `dsr_access` | GDPR/CCPA data access by email. |
| `dsr_delete` | GDPR/CCPA data delete by email. *Destructive.* |

Session and recovery tools read from the Churnkey analytics warehouse — sessions refresh every ~3 hours, recoveries every ~20 minutes. DSR tools read/write the operational store directly (no lag).

Blueprint edits are **granular and draft-only**: each tool mutates the unlocked working copy and sends only the targeted fields (never the full `steps` array with translations). `update_blueprint_step` handles copy + behavioral flags, `update_blueprint_offer` handles offer config, `edit_survey_structure` handles survey choices/follow-ups, and `add_blueprint_step`/`remove_blueprint_step` handle step structure. Copy edits clear stale translations for the affected content; `publish_blueprint` refreshes translations before making the draft live and is the only live-impacting blueprint action (so it's the one that requires a `confirm`).

Segment tools (`reorder_segments`, `set_segment_enabled`, `update_segment_filter`) act on **live** config directly (segments have no draft cycle), so each requires an explicit `confirm` literal and writes an audit log.

Each tool's input schema is fully described to the MCP client — enums for `saveType` / `offerType` / `billingInterval` / breakdown dimensions, `not` object for exclusions, structured types for booleans and numbers.

Mode (live vs test) is set by the API key prefix — pass a `test_`-prefixed key to query test data. Mode applies to **session analytics** and DSR. **Blueprint/segment configuration is shared across modes** (not key-dependent), and **payment-recovery analytics are not partitioned by mode** (dunning campaigns come from real provider failed-payment events and carry no test/live distinction).

## Transports

The package supports two transports:

- **stdio** (default): local MCP clients run `npx -y @churnkey/mcp` and pass credentials through environment variables.
- **Streamable HTTP** (opt-in): run the same server behind a single HTTP endpoint, usually `/mcp`.

For a public Churnkey-hosted endpoint, the recommended shape is:

- `https://mcp.churnkey.co` — public docs / onboarding site.
- `https://mcp.churnkey.co/mcp` — Streamable HTTP MCP endpoint.

That keeps the human site and protocol endpoint on one memorable domain without making the root URL a machine-only route.

## Setup

1. Get your **App ID** and **Data API Key** from [Churnkey → Settings → Organization](https://app.churnkey.co/settings/organization). Don't have an account? [Create one](https://app.churnkey.co/register?intent=sdk).
2. Add the server to your MCP client config.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "churnkey": {
      "command": "npx",
      "args": ["-y", "@churnkey/mcp"],
      "env": {
        "CHURNKEY_APP_ID": "your_app_id",
        "CHURNKEY_API_KEY": "your_api_key"
      }
    }
  }
}
```

Fully quit and reopen the app for the server to load.

### Claude Code

Easiest — register from the CLI:

```bash
claude mcp add churnkey \
  -e CHURNKEY_APP_ID=your_app_id \
  -e CHURNKEY_API_KEY=your_api_key \
  -- npx -y @churnkey/mcp
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
      "args": ["-y", "@churnkey/mcp"],
      "env": {
        "CHURNKEY_APP_ID": "your_app_id",
        "CHURNKEY_API_KEY": "your_api_key"
      }
    }
  }
}
```

Restart the client after editing config.

## Environment variables

| Var | Required | Default |
|-----|----------|---------|
| `CHURNKEY_APP_ID` | yes | — |
| `CHURNKEY_API_KEY` | yes | — |
| `CHURNKEY_API_URL` | no | `https://api.churnkey.co/v1` |

Use a `test_`-prefixed API key for staging data.

## Local API testing

When testing against a local `churnkey-api` server, start the API on port 3000, then run:

```bash
pnpm local-run --app-id your_app_id --api-key test_data_your_key
```

The command builds `@churnkey/mcp`, starts the MCP server over stdio, and defaults `CHURNKEY_API_URL` to `http://localhost:3000/v1`. Pass `--api-url` only if your local API is running somewhere else.

For MCP client configs, point the client directly at the built server and provide the same environment variables:

```json
{
  "mcpServers": {
    "churnkey-local": {
      "command": "node",
      "args": ["/Users/ig/Documents/Churnkey/sdk/packages/mcp/dist/bin.js"],
      "env": {
        "CHURNKEY_APP_ID": "your_app_id",
        "CHURNKEY_API_KEY": "test_data_your_key",
        "CHURNKEY_API_URL": "http://localhost:3000/v1"
      }
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

`CHURNKEY_MCP_ALLOWED_HOSTS` is a comma-separated list of accepted `Host` headers, including ports when present (for example, `mcp.churnkey.co,localhost:3333`). `CHURNKEY_MCP_CORS_ORIGIN` is intentionally opt-in; set it to one exact browser origin, or `*`, only when a browser-based MCP client needs CORS.

## Streamable HTTP

Start the HTTP server after building:

```bash
pnpm --filter @churnkey/mcp build
CHURNKEY_APP_ID=your_app_id \
CHURNKEY_API_KEY=test_data_your_key \
pnpm --filter @churnkey/mcp start:http
```

By default this listens on `http://127.0.0.1:3333/mcp`. You can also run the built binary directly:

```bash
CHURNKEY_MCP_TRANSPORT=http node packages/mcp/dist/bin.js
node packages/mcp/dist/bin.js --http
node packages/mcp/dist/bin.js --transport=http
```

For a shared or hosted HTTP endpoint, credentials may be sent on the initialization request instead of read from environment variables:

```bash
curl http://127.0.0.1:3333/mcp \
  -H 'content-type: application/json' \
  -H 'x-ck-app: your_app_id' \
  -H 'x-ck-api-key: test_data_your_key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0.1.0"}}}'
```

The server also accepts `Authorization: Bearer <api_key>` for the API key. `x-ck-api-key` takes precedence if both are provided.

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
