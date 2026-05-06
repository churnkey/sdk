# @churnkey/mcp

Model Context Protocol server for [Churnkey](https://churnkey.co). Lets AI agents (Claude Code, Cursor, Claude Desktop, etc.) read your sessions, run analytics queries, and handle GDPR/unsubscribe requests.

## Tools

| Tool | Description |
|------|-------------|
| `list_sessions` | Cancel/dunning sessions, with filters for date range, customer, outcome (saveType/canceled/aborted), plan, segment, A/B test, etc. Negation via `not: { ... }`. Default 50 / max 500 per call. |
| `aggregate_sessions` | Session counts, optionally grouped by `breakdownBy` dimensions (saveType, offerType, planId, day/week/month, …). Same filter set as `list_sessions`. |
| `get_api_usage` | API call volume — useful for "is the embed firing?" debugging. |
| `dsr_access` | GDPR/CCPA data access by email. |
| `dsr_delete` | GDPR/CCPA data delete by email. *Destructive.* |

Each tool's input schema is fully described to the MCP client — enums for `saveType` / `offerType` / `billingInterval` / breakdown dimensions, `not` object for exclusions, structured types for booleans and numbers. Mode (live vs test) is set by the API key prefix; pass a `test_`-prefixed key to query test data.

## Setup

1. Get your **App ID** and **Data API Key** from `app.churnkey.co/settings/data-api`.
2. Add the server to your MCP client config.

### Claude Desktop / Claude Code

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `~/.claude/claude_desktop_config.json`:

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
