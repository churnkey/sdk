# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Expect breaking changes in minor versions while we're pre-1.0.

## 0.1.2 — 2026-05-01

### Fixed

- `import '@churnkey/react/styles.css'` no longer triggers TS2882 ("Cannot find module or type declarations for side-effect import") under `moduleResolution: "bundler" | "node16" | "nodenext"`. The `./styles.css` export now ships a `types` condition pointing at an empty `styles.css.d.ts`, satisfying TypeScript's resolver for side-effect-only imports.

## 0.1.1 — 2026-04-30

### Fixed

- `package.json#repository.url` pointed at `churnkey/churnkey-sdk` instead of `churnkey/sdk`. Metadata-only — no code changes.

## 0.1.0 — 2026-04-30

First public release.

### Added

- `<CancelFlow>` drop-in modal. Pass a `steps` array and `onAccept` / `onCancel`; nothing else is required.
- Built-in offer types: `discount`, `pause`, `plan_change`, `trial_extension`, `contact`, `redirect`. Each renders as a self-contained component and has a per-type override slot (`DiscountOffer`, `PauseOffer`, …) on the `components` prop.
- Custom step and offer types via `customComponents`. They route through the same navigation, callbacks, and session recording as built-ins — there's no separate path.
- Headless `useCancelFlow()` hook for consumers rendering their own UI.
- `appearance.colorScheme: 'light' | 'dark' | 'auto'`. `'auto'` follows OS preference and reacts to changes.
- Three customization seams that compose: `appearance.variables` (CSS custom properties), `classNames` (for Tailwind/CSS-modules), `components` (swap implementations).
- Visited-step back navigation. `back()` pops the actually-visited stack, so declining an offer and going back lands on the offer, not two steps before it.
- Integration modes:
    - **Local** — no Churnkey account, no network. Steps in code, billing in your callbacks.
    - **Analytics** — add `appId` + `customer` and sessions are recorded for save-rate, cancellation reasons, and offer performance. Billing still runs in your handlers. Pass `subscriptions` to enrich sessions with plan and price.
    - **Token** — generate a session token server-side with `@churnkey/node`, pass `session={token}`. Step config comes from the dashboard; Churnkey executes billing actions on your provider. Local handlers can override individual actions.
- `mode: 'live' | 'test'` separates staging from production analytics. The signed token's mode wins in token mode.
- Three entry points for tree-shaking: `@churnkey/react`, `@churnkey/react/headless`, `@churnkey/react/core`. Stylesheet at `@churnkey/react/styles.css`. Ships ESM + CJS, type declarations, and source maps.

### Notes

- React 18 and 19 supported as peer deps.
- Pre-1.0: minor versions may carry breaking changes; this file will call them out.
