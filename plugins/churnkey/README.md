# Churnkey plugin extension (draft)

This package adds OpenAI's new plugin extensions to the existing `@churnkey/mcp` server:

- **Sidebar and thread entrypoints:** `open_flow_explorer` opens an MCP App with the current cancel-flow inventory, published-version journey, date-windowed performance, and an explicit handoff to the chat host.
- **Composer mentions:** `search_mentions` finds workspace flows. Each mention resolves a `churnkey://flows/{flowId}` resource with current inventory metadata and the correct published blueprint ID for metrics.
- **Portable plugin packaging:** `plugin.json` and `mcp.json` use the Agent Plugins schemas, with OpenAI presentation metadata under `extensions.com.openai`.

The explorer itself is read-only. Existing MCP configuration tools remain available according to the user's OAuth grant. The manifest advertises both Read and Write because the complete server includes those tools.

## Run the recording demo

From the **sdk repository root**, using Node 22 or newer and pnpm 9:

```sh
pnpm install
pnpm --filter @churnkey/mcp demo:extensions
```

Open `http://127.0.0.1:4319`. Override the port with `CHURNKEY_DEMO_PORT` if needed.

The demo runs the **built MCP server** over an in-memory MCP transport against a loopback-only synthetic API. Its iframe uses the official MCP Apps `App` / `AppBridge` and postMessage transport. Flow reads, metrics reads, mention search, and mention resource resolution go through real MCP calls. It requires no Churnkey credentials, makes no production API calls, and permits only four read tools.

The surrounding sidebar and composer are a **local demonstration host**, not ChatGPT. “Ask ChatGPT” displays the message and selected-flow reference received by the host; no model response is generated. The banner stays visible in recordings. This proves bridge behavior and gives us an honest prototype demo; it does not verify ChatGPT's native navigation, rendering, OAuth, or directory installation.

## Test the branch in ChatGPT

1. Build `@churnkey/mcp` from this branch. Authenticate with Churnkey OAuth and an account whose admin enabled MCP. For this explorer, the relevant read scopes are `cancel_flows.blueprints.read` and `cancel_flows.metrics.read`.
2. Connect the built local server through [Secure MCP Tunnel / developer mode](https://developers.openai.com/plugins/deploy/connect-chatgpt), or deploy this branch through the existing hosted MCP workflow **after deployment authorization**. The checked-in `mcp.json` points to the existing hosted endpoint; it cannot expose these new extensions until that endpoint runs this code.
3. Install the personal plugin in ChatGPT Work, then refresh its connection after server changes. Check that Flow Explorer appears in global navigation and can also open in a thread. Classic ChatGPT is not covered by the launch's support table.
4. Open a flow with unpublished changes. Confirm it shows the **published** blueprint, live metrics, the ~3-hour warehouse refresh notice, and any sample-size warning. For an unpublished flow, show its draft and no performance metrics. With a test-mode connection, leave performance unavailable: the API can mix test session counts with live-only boosted revenue. Scope failures must show unavailable data rather than fabricated numbers.
5. Select a flow and click “Ask ChatGPT about this flow.” Verify the host receives the selected workspace, flow, published blueprint, date window, and sample-size warning. Ask for an improvement without changing or publishing anything.
6. Search for a flow in the composer. Insert its resource mention and ask about it. Resolve the resource under the current token; an unknown or no-longer-accessible flow must fail.
7. Record the native ChatGPT demo once those checks pass. Submit through the plugin portal separately; this draft has not been published, deployed, or submitted.

For a **local plugin install** while the hosted version is unchanged, copy this plugin directory outside the repository and replace that copy's `mcp.json` with a stdio server that points to the absolute `packages/mcp/dist/bin.js` from this worktree:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "churnkey": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/sdk/packages/mcp/dist/bin.js"]
    }
  }
}
```

Use the existing `auth login` CLI flow for local credentials; do not put tokens in the manifest. Public directory submission requires a hosted HTTPS endpoint. Local support and developer-mode availability depend on the OpenAI account/client.

## Demo sequence (about 35 seconds)

1. Open Flow Explorer and show the default flow's journey and metrics.
2. Select **Annual subscribers** to show the unpublished-changes badge and published-version preview.
3. Switch from 30 days to 7 days. The read uses that published blueprint and the selected date window.
4. Select **Starter plan** to show the sample-size warning. Select **Trial customers** to show the unpublished state without metrics.
5. Search **Annual** in the composer, then insert the flow mention.
6. Return to Annual subscribers and use **Ask ChatGPT about this flow** to show the selected-flow context handoff.

## Sources

- [OpenAI MCP Extensions spec](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md)
- [TypeScript extension SDK](https://github.com/openai/mcp-extensions/tree/main/typescript)
- [Plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt)

Implementation reviewed against OpenAI MCP Extensions commit `93a30a92c1e520da18c4b05a29186ee7c48bc046` on 2026-09-29. The SDK is an early `0.1.0` release; native-host validation remains required before shipping.
