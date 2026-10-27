# Churnkey SDK

A production-ready cancel flow for React. Open source. Optionally connects to [Churnkey](https://churnkey.co) for analytics and AI-powered retention.

## Packages

| Package | Description |
| --- | --- |
| [`@churnkey/react`](./packages/react) | The cancel flow. Drop-in component, headless hook, or core state machine. React 18 and 19. |
| [`@churnkey/node`](./packages/node) | Server-side token generation. Only needed if Churnkey is handling billing actions for you, or if you're using the hosted embed. |
| [`@churnkey/mcp`](./packages/mcp) | Model Context Protocol server. Lets Claude, Cursor, and other AI agents query your Churnkey data (sessions, analytics, DSR) using a Data API key. |

## Quick start

```bash
npm install @churnkey/react
```

```tsx
import { CancelFlow } from '@churnkey/react'
import '@churnkey/react/styles.css'

<CancelFlow
  steps={[
    {
      type: 'survey',
      title: 'Why are you leaving?',
      reasons: [
        {
          id: 'expensive',
          label: 'Too expensive',
          offer: { type: 'discount', couponId: 'STRIPE_SAVE20', percentOff: 20, durationInMonths: 3 },
        },
        { id: 'not-using', label: 'Not using it enough', offer: { type: 'pause', months: 2 } },
        { id: 'missing', label: 'Missing features' },
      ],
    },
    { type: 'feedback', title: 'Anything else?' },
    { type: 'confirm' },
  ]}
  handleDiscount={async (offer) => myBilling.applyCoupon(offer.couponId)}
  handlePause={async (offer) => myBilling.pause({ months: offer.result?.months ?? offer.months })}
  handleCancel={async () => myBilling.cancel()}
  onClose={() => setOpen(false)}
/>
```

## Documentation and resources

- [`@churnkey/react`](./packages/react/README.md) — full API reference, customization, headless usage, custom step types
- [`@churnkey/node`](./packages/node/README.md) — `createToken` and `authHash`
- [`@churnkey/mcp`](./packages/mcp/README.md) — MCP server for Claude / Cursor / Claude Desktop
- [Create a free Churnkey account](https://app.churnkey.co/register?intent=sdk) — get an `appId` for analytics
- [churnkey.co](https://churnkey.co) — dashboard, hosted embed, AI retention features

## Repo layout

```
sdk/
├── packages/
│   ├── react/      @churnkey/react
│   ├── node/       @churnkey/node
│   └── mcp/        @churnkey/mcp
├── apps/
│   └── playground/ internal dev playground
└── scripts/        release + tooling helpers
```

## Local development

```bash
pnpm install
pnpm --filter @churnkey/react build
pnpm --filter @churnkey/react test
```

To work against the playground:

```bash
pnpm --filter @churnkey/react dev    # rebuilds on change
pnpm --filter @churnkey/playground dev   # runs the playground app
```

## Releasing

A merge to `main` that raises a package's `package.json` version publishes it. In the PR:

1. Bump `version` in the package's `package.json`.
2. Move the `Unreleased` entries in its `CHANGELOG.md` under a `## <version> - <date>` heading. That section becomes the GitHub release notes.
3. For `@churnkey/mcp`, also set the version in `server.json` and `src/server.ts`.

On merge, the Release workflow runs the CI gate, publishes to npm with provenance, pushes the `<name>@<version>` tag and creates the GitHub release. For `@churnkey/mcp` it then runs the registry publish. A merge that does not change a version publishes nothing. If a release fails partway, fix the cause and run the Release workflow by hand; it skips whatever already landed.

Publishing authenticates with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so there is no npm token in this repo. Each package lists this repo's `release.yml` as its trusted publisher in its settings on npmjs.com.

## License

MIT
