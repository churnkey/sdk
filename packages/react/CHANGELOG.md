# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Expect breaking changes in minor versions while we're pre-1.0.

## 0.7.0 — 2026-07-13

### Added

- `i18n` prop on `CancelFlow` / `useCancelFlow`: locale selection (browser default, exact → base-language → `en` fallback chain) and deep-partial overrides for every built-in string via a typed message catalog (`CancelFlowMessages`), with `{token}` interpolation.
- Timing-aware messages: `confirm.cta`, `confirm.periodEndNotice`, and `success.cancelled.*` accept `{ immediate, atPeriodEnd }` pairs, resolved against the flow's effective cancel timing (server-resolved in connected mode).
- `cancelAtPeriodEnd` prop: local-mode declaration of billing behavior driving timing-aware copy; ignored in connected mode.
- Per-offer success copy: accepting a discount, pause, trial extension, plan change, or rebate shows outcome-specific confirmation (widget-parity defaults); pause supports `{resumeDate}` from the accepted duration. Contact, redirect, and custom types keep the generic copy.
- Org-level overrides: dashboard-configured `sdkTranslations` arrive on the connected-mode config and merge between built-in defaults and the developer's `i18n.messages`.
- `acceptedOffer` on flow state and `SuccessStepProps`; `messages` and `cancelAtPeriodEnd` returned from `useCancelFlow`; `defaultMessages`, `buildMessages`, `selectTiming`, `formatMessage` exported from `@churnkey/react/core`.

### Changed

- Connected-mode flows with end-of-period timing now render an access-until notice on the confirm step ("Your access continues until …"). Previously documented but never rendered; local mode shows it only with an explicit `cancelAtPeriodEnd={true}`.
- Accepting a built-in offer shows type-specific success copy by default (e.g. "Discount applied." instead of "Welcome back!"). Override per type via `i18n` or restore the old copy with `savedTitle` / `savedDescription`.

## 0.6.5 — 2026-07-09

### Added

- Render description/body RichText as <div> (as="div") so block-level embeds aren't hoisted.
- Add responsive 16:9 media CSS under .ck-step-description (iframe, video, [data-youtube-video]) - fills width, overrides the inline height="480".

### Added

- add `settings.cancelAtPeriodEnd` to SDK config types, and pass configured cancellation timing into token-mode cancel actions

## 0.6.4 — 2026-07-07

### Added

- add `settings.cancelAtPeriodEnd` to SDK config types, and pass configured cancellation timing into token-mode cancel actions

## 0.6.3 — 2026-07-06

### Fixed

- `DefaultPauseOffer` no longer shows the duration chip selector when the offer only has one month to choose from.

## 0.6.2 — 2026-07-02

### Added

- Pass **custom offers** through the token-mode transform

## 0.6.0 — 2026-06-10

### Added

- **Stripe Sandbox support.** `mode` accepts `'sandbox'` on `<CancelFlow>`, `useCancelFlow`, and session tokens. [Sandboxes](https://docs.stripe.com/sandboxes) supersede Stripe's classic test mode and live under a separate Stripe account ID with their own credentials — pass `'sandbox'` when your Churnkey org is connected to one, so server-side billing actions (discounts, pauses, cancels) run against the sandbox. Sessions record as `SANDBOX`.

### Changed

- `decodeSessionToken` throws on an unrecognized mode instead of treating it as `'live'`. A missing mode still defaults to `'live'`. The old coercion meant a token signed with a mode this package didn't know about would run the flow against live billing — it now fails loudly instead. If you mint tokens with `@churnkey/node`, upgrade both packages together.

## 0.5.0 — 2026-06-10

### Added

- **`customerAttributes`** on `<CancelFlow>` and `useCancelFlow` — a client-side attribute layer for things only your app knows (usage counts, entitlements, lifecycle stage). In connected mode the attributes are sent with the config request, so segments can match on them when picking which flow to serve; the server still fetches the customer from your billing provider and layers the attributes on top. In every mode the keys resolve as merge fields in dashboard copy and are recorded on the session, winning key conflicts with `customer.metadata`. Same semantics as the embed widget's `customerAttributes`, so segments built for the embed work unchanged.

### Fixed

- `handleRebate` / `onRebate` now route through the hook's ref dispatch like every other callback. They were missing from the dispatch table, so the machine held the first render's closures — a rebate callback reading component state saw mount-time values, and one attached after mount never registered at all. In connected mode that second case meant the server-side refund ran instead of your `handleRebate`.

## 0.4.2 — 2026-06-01

### Changed

- `DefaultRebateOffer` shows the actual cash refunded. On a taxed invoice the rebate comes back with the tax paid on it, so the middle line reads "Money back" with the full refund and an "(incl. $X tax)" note, and the net reflects it. No-tax invoices are unchanged — the note is hidden and the refund equals the rebate.

## 0.4.1 — 2026-05-30

### Changed

- Clearer rebate invoice copy in `DefaultRebateOffer`. The lines now read "You paid this period" / "Cancellation rebate" / "Your net for this period" — the period charge is already paid, so the previous "Due for this period" wording was misleading.

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
