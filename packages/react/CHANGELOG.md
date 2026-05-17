# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Expect breaking changes in minor versions while we're pre-1.0.

## 0.2.0 — 2026-05-16

### Added

- `ConfirmStep.losses?: string[]` — optional bullet list of what the customer is giving up. `DefaultConfirm` renders a styled list between the description and the period-end notice. Naming losses concretely is more honest than waving at them in a generic line of copy.
- `ConfirmStep.lossesLabel?: string` — heading shown above the loss list. Defaults to `"You'll lose access to:"`.
- `ConfirmClassNames.lossList`, `lossLabel`, `lossItem`, `lossBullet` — className slots for the loss-list pieces, alongside the existing `title` / `description` / `confirmButton` / etc.
- `AppearanceVariables` widened from 11 to 25 typed keys: `colorSurface`, `colorSurfaceMuted`, `colorBorderStrong`, `colorTextMuted`, `colorPrimarySoft`, `colorSuccessSoft`, `colorDangerHover`, `colorDangerSoft`, `fontFamilyMono`, `fontFamilyDisplay`, `stepTitleWeight`, `stepTitleLetterSpacing`. The underlying `--ck-*` CSS custom properties have always worked; this is the JS-side typed surface catching up.
- `formatMonthDayLong(date)` exported from `@churnkey/react/core` — long-month form (`"April 30"`) for prominent date displays. Used by the redesigned `DefaultPauseOffer`.

### Changed

- **`DefaultPauseOffer` redesigned.** The resume date is now the typographic anchor — a small `We'll see you back on` kicker over a display-font date — with ink-filled month chips beneath it as the subordinate control. The previous segment-selector + calendar-callout layout is gone. Component props are unchanged; this is a visual rewrite.
- `.ck-success-icon` swapped from green-on-green to sand-disc-with-ink-check. The check itself is the success cue; the disc is just elevation.

### Removed

- CSS class names from the old pause layout: `.ck-pause-segments`, `.ck-pause-segment`, `.ck-pause-segment--selected`, `.ck-pause-resume`, `.ck-pause-resume-label`, `.ck-pause-resume-date`, `.ck-pause-resume-icon`. **Breaking** if you targeted these from your own stylesheet for additional theming — replace with `.ck-pause-card`, `.ck-pause-eyebrow`, `.ck-pause-date`, `.ck-pause-chips`, `.ck-pause-chip`, `.ck-pause-chip--selected`.

### Notes

- All breaking changes are CSS-class renames. No JS API was removed.

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
