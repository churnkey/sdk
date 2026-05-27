# @churnkey/mcp

Model Context Protocol server for [Churnkey](https://churnkey.co). Lets AI agents (Claude Code, Cursor, Claude Desktop, etc.) read your sessions, run analytics queries, and handle GDPR requests.

## Tools

| Tool | Description |
|------|-------------|
| `list_sessions` | Cancel/dunning sessions, with filters for date range, customer, outcome (saveType/canceled/aborted), plan, segment, A/B test, etc. Negation via `not: { ... }`. Default 50 / max 500 per call. |
| `aggregate_sessions` | Session counts, optionally grouped by `breakdownBy` dimensions (saveType, offerType, planId, day/week/month, …). Same filter set as `list_sessions`. |
| `aggregate_payment_recoveries` | Failed-payment recovery (dunning) counts and dollar amounts — invoice / recovered / pending / lost, in original currency and USD. Group by time, card brand, decline reason, outcome, blueprint, currency, recovered/active state. |
| `list_payment_recoveries` | Individual failed-payment recovery campaigns. Same filter set as the aggregation. |
| `list_blueprints` | Current cancel flow inventory for the org: the default flow plus segment flows, with status (`Active`, `Setup Pending`, or `Inactive`) plus compact draft and published metadata. |
| `get_blueprint` | Full cancel flow blueprint by ID. Use this before draft updates so unchanged fields can be preserved. |
| `update_blueprint_draft` | Draft-only updates for allowed blueprint fields (`name`, `brandImage`, `primaryColor`, `steps`, `translatedLanguages`). Passing a published blueprint ID edits the corresponding working copy. Writes an audit log. |
| `publish_blueprint` | Publish a draft blueprint as the live org/segment version. Requires `confirm: "publish"` and writes an audit log. |
| `list_segments` | Active cancel flow segment metadata in current priority order. Segment audience filter rules are not returned. |
| `reorder_segments` | Reorder cancel flow segment priority. Requires `confirm: "reorder_segments"` and writes an audit log. |
| `dsr_access` | GDPR/CCPA data access by email. |
| `dsr_delete` | GDPR/CCPA data delete by email. *Destructive.* |

Session and recovery tools read from the Churnkey analytics warehouse — sessions refresh every ~3 hours, recoveries every ~20 minutes. DSR tools read/write the operational store directly (no lag).

Blueprint draft updates are intentionally separate from publishing. An agent can update the unlocked working copy directly, or pass the currently published blueprint ID and let the API resolve the working copy, then publish only via the separate confirmed `publish_blueprint` tool. Segment reordering is also a separate confirmed action because order affects which flow customers see.

Each tool's input schema is fully described to the MCP client — enums for `saveType` / `offerType` / `billingInterval` / breakdown dimensions, `not` object for exclusions, structured types for booleans and numbers. Mode (live vs test) is set by the API key prefix; pass a `test_`-prefixed key to query test data.

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
