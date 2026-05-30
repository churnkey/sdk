# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Expect breaking changes in minor versions while we're pre-1.0.

## 0.4.0 — 2026-05-29

### Added

- **Rebate offer type.** A `rebate` is a partial refund of the customer's most recent paid invoice while their subscription stays active — aimed at money-back-guarantee windows, where a customer who would cancel to get their money back can take a partial refund and stay instead.
  - The `'rebate'` offer type joins the config union — the local shape plus the fields resolved in token mode (`amountMinor`, `currency`, `amountPaidMinor`, `netAfterRebateMinor`) — wired through the state machine, the config transform, and the offer-type map.
  - `DefaultRebateOffer` renders the offer as an itemized invoice: the period charge, the rebate being credited, and what's still due, with the rebate line accented. Overridable via `components.RebateOffer`.
  - `handleRebate` / `onRebate` callbacks, matching the other offer types. In connected mode the SDK runs the rebate server-side; defining `handleRebate` overrides that to run the refund through your own billing.
  - The accepted rebate amount is recorded on the session.

### Changed

- Offer panels now share one surface. The discount and trial-extension panels use `colorSurfaceMuted` (the neutral callout surface) instead of `colorPrimarySoft` (the indigo tint), so every offer panel reads consistently and `colorPrimarySoft` is reserved for selected-state highlights as documented. Override the relevant `--ck-*` properties to restore the previous tint.

## 0.3.0 — 2026-05-19

### Added

- `customer: DirectCustomer | null` and `subscriptions: DirectSubscription[]` are now passed to every step component, not just custom ones. `SurveyStepProps`, `OfferStepProps`, `FeedbackStepProps`, `ConfirmStepProps`, and `SuccessStepProps` all receive them. Defaults use this to render context-aware UI without consumers shuttling props through.
- Follow-up text input on survey reasons. A reason with `freeform: true` reveals a textarea below the reason list when selected. The typed text travels to the session as `followupResponse` — the same field the embed widget uses — so dashboard groupings line up across both clients.
- `useCancelFlow()` returns `setFollowupResponse` (action) and `followupResponse` (state), plus `retry` for refetching the config in token mode.
- `DefaultPlanChangeOffer` is current-plan aware: the card matching the customer's current price id renders disabled with a "Current" badge, and the initial selection seeds to the first non-current plan.
- `DefaultConfirm` derives the period-end notice from `subscriptions[0].status.currentPeriod.end`. Canceled subscriptions, missing periods, and unparseable dates omit the notice cleanly.
- `formatPeriodEnd(subscriptions)` exported from `@churnkey/react/core` for consumers reusing the logic.
- `BUILT_IN_OFFER_TYPES` exported from `@churnkey/react/core`.
- `ModalProps.overlayClassName` and `StructuralClassNames.overlay` — style the dim layer behind the modal without overriding the whole `Modal`.
- Standalone `OfferStep`s without explicit `copy` now fall back to the same default copy that survey-attached offers use. Previously a standalone offer with no copy rendered empty strings.
- Unregistered offer types (offer `type` not in `BUILT_IN_OFFER_TYPES` and no `CustomOffer` registered) auto-decline and advance, mirroring the existing fallback for unregistered step types.

### Changed

- **Session payload shape aligned with the embed widget.** `surveyChoiceValue` is now always the static reason label. Typed follow-up text travels separately on the new `followupResponse` field instead of overloading `surveyChoiceValue`. Dashboards keyed off `surveyChoiceValue` for reason groupings get more reliable buckets as a side effect.
- Default overlay color changed from a primary-tinted `color-mix(...)` to a neutral translucent ink. Set `--ck-overlay-color` to the old `color-mix(in srgb, var(--ck-color-primary) 40%, transparent)` if you want the previous behavior.
- `DefaultSurvey` no longer hijacks arrow keys for reason navigation. Native tab navigation between radio buttons works as expected; the custom roving-tabindex pattern was producing focus surprises.
- `AcceptedOffer.reasonId` is now `string | undefined`. Standalone `OfferStep`s have no reason to carry; only offers routed from a survey reason populate it.
- `decisionId` no longer leaks into the consumer-facing `AcceptedOffer` payload. It was SDK-internal.

### Removed

The following props were declared in 0.2.0 but never wired to behavior. Removing them now to keep the public surface honest:

- `PauseOffer.datePicker`
- `PlanChangeOffer.currentPlanId` — derived now from the customer's subscriptions
- `ConfirmStepProps.periodEnd` — derived now from `subscriptions[0].status.currentPeriod.end`
- `CancelFlowProps.layout`
- `CancelFlowProps.animation`

### Breaking changes

- **Step-component overrides** (`components.Survey`, `Offer`, `Feedback`, `Confirm`, `Success`): must accept the new `customer` and `subscriptions` props. TypeScript will flag every site.
- **Survey overrides**: rename `freeformText` / `onFreeformChange` to `followupResponse` / `onFollowupResponseChange`. The `SurveyClassNames.freeformInput` slot is now `followupInput`. The internal `.ck-reason-freeform` CSS class is `.ck-reason-followup`.
- **Headless consumers**: `setFreeformText` is now `setFollowupResponse`.
- **Session-analytics consumers**: typed follow-up text now arrives on `followupResponse` rather than overloading `surveyChoiceValue`. If a downstream consumer was reading the typed text from `surveyChoiceValue`, point it at `followupResponse` instead.
- Removed props above are no longer accepted.
- `AcceptedOffer.reasonId` is now optional.

### Notes

- The session payload changes match what `@churnkey/embed` already sends, so the same dashboard queries work for both clients.

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
