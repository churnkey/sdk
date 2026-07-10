// Message catalog for every string the SDK renders that isn't flow content.
// Flow content (step titles, offer copy) is authored per-org in the dashboard
// and arrives resolved in token mode; this catalog covers the chrome around
// it. Overrides layer lowest-to-highest: built-in defaults, then each entry
// in the locale fallback chain of `i18n.messages`, and per-step props
// (confirmLabel, savedTitle, …) win over everything at the render site.

/** Both timing variants of a message. Which one renders is decided by the
 *  flow's effective cancel timing (`FlowState.cancelAtPeriodEnd`). */
export interface TimingVariants {
  immediate: string
  atPeriodEnd: string
}

/**
 * A message that may differ by cancellation timing. Plain strings render
 * as-is in both cases; pass the object form when the wording should change
 * (e.g. "Cancel" vs "Turn off auto-renew").
 */
export type TimingAware = string | TimingVariants

export interface CancelFlowMessages {
  common: {
    continue: string
    back: string
    close: string
    done: string
    processing: string
    tryAgain: string
    loading: string
    loadError: string
    error: string
    day: string
    days: string
    month: string
    months: string
  }
  survey: {
    title: string
    followupPlaceholder: string
    followupAriaLabel: string
  }
  feedback: {
    title: string
    placeholder: string
    /** Used instead of `placeholder` when the step sets `minLength`. Supports `{minLength}`. */
    placeholderWithMin: string
  }
  confirm: {
    title: string
    lossesLabel: string
    cta: TimingAware
    goBack: string
    /** Shown between the description and the confirm button. Supports
     *  `{periodEnd}`. The default immediate variant is empty, which
     *  suppresses the notice for immediate timing; empty OVERRIDE values are
     *  dropped like any blank override, so to remove the notice entirely
     *  replace the `Confirm` component or hide it via
     *  `classNames.periodEndNotice`. */
    periodEndNotice: TimingAware
  }
  success: {
    saved: {
      title: string
      description: string
    }
    cancelled: {
      title: TimingAware
      description: TimingAware
    }
  }
  offer: {
    limitedTimeEyebrow: string
    pauseEyebrow: string
    newEndDateLabel: string
    currentPlanBadge: string
    /** CTA when a plan is selected in a plan-change offer. Supports `{planName}`. */
    switchToCta: string
    rebate: {
      paidLabel: string
      moneyBackLabel: string
      /** Tax parenthetical after the money-back label. Supports `{amount}`. */
      inclTax: string
      netLabel: string
    }
  }
}

/**
 * Recursive partial of the catalog for overrides. Timing-aware fields also
 * accept a plain string (applies to both timings) or a partial variant pair
 * (the missing variant keeps the base value).
 */
export type MessagesPatch<T = CancelFlowMessages> = {
  [K in keyof T]?: T[K] extends string
    ? string
    : T[K] extends TimingAware
      ? string | Partial<TimingVariants>
      : MessagesPatch<T[K]>
}

export interface I18nConfig {
  /** UI language. Defaults to the browser language, falling back to `'en'`. */
  locale?: string
  /** Per-locale message overrides, e.g. `{ en: { confirm: { cta: 'Turn off auto-renew' } } }`. */
  messages?: Record<string, MessagesPatch>
}

export const defaultMessages: CancelFlowMessages = {
  common: {
    continue: 'Continue',
    back: 'Back',
    close: 'Close',
    done: 'Done',
    processing: 'Processing...',
    tryAgain: 'Try again',
    loading: 'Loading your options...',
    loadError: "We couldn't load your cancellation options. Please try again.",
    error: 'Something went wrong. Please try again.',
    day: 'day',
    days: 'days',
    month: 'month',
    months: 'months',
  },
  survey: {
    title: 'Why are you cancelling?',
    followupPlaceholder: 'Tell us more (optional)',
    followupAriaLabel: 'Additional detail',
  },
  feedback: {
    title: 'Any other feedback?',
    placeholder: 'Type your thoughts…',
    placeholderWithMin: 'At least {minLength} characters…',
  },
  confirm: {
    title: 'Confirm cancellation',
    lossesLabel: "You'll lose access to:",
    cta: 'Cancel subscription',
    goBack: 'Go back',
    periodEndNotice: {
      immediate: '',
      atPeriodEnd: 'Your access continues until {periodEnd}.',
    },
  },
  success: {
    saved: {
      title: 'Welcome back!',
      description: 'Your offer has been applied.',
    },
    cancelled: {
      title: 'Subscription cancelled',
      description: "We're sorry to see you go.",
    },
  },
  offer: {
    limitedTimeEyebrow: 'Limited-time offer',
    pauseEyebrow: "We'll see you back on",
    newEndDateLabel: 'New end date',
    currentPlanBadge: 'Current',
    switchToCta: 'Switch to {planName}',
    rebate: {
      paidLabel: 'You paid this period',
      moneyBackLabel: 'Money back',
      inclTax: '(incl. {amount} tax)',
      netLabel: 'Your net for this period',
    },
  },
}

function isTimingVariants(value: unknown): value is Partial<TimingVariants> {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('immediate' in value || 'atPeriodEnd' in value) &&
    !Array.isArray(value)
  )
}

/**
 * Pick the string for the flow's effective cancel timing. `null` (timing
 * unknown — local mode) behaves like period-end, matching the default the
 * cancel action itself uses.
 */
export function selectTiming(value: TimingAware, cancelAtPeriodEnd: boolean | null): string {
  if (typeof value === 'string') return value
  return (cancelAtPeriodEnd ?? true) ? value.atPeriodEnd : value.immediate
}

/** Replace `{name}` tokens. Unknown tokens are left in place. */
export function formatMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = vars[name]
    return value == null ? match : String(value)
  })
}

// Empty-string overrides are dropped (a blank dashboard field must not
// clobber a real string — same rule as the embed), which is why defaults
// may legitimately hold '' but patches never land one.
function mergeValue(base: unknown, patch: unknown): unknown {
  if (typeof patch === 'string') return patch === '' ? base : patch
  if (isTimingVariants(patch)) {
    const baseVariants: TimingVariants =
      typeof base === 'string'
        ? { immediate: base, atPeriodEnd: base }
        : { immediate: '', atPeriodEnd: '', ...(base as Partial<TimingVariants>) }
    const result = { ...baseVariants }
    if (patch.immediate) result.immediate = patch.immediate
    if (patch.atPeriodEnd) result.atPeriodEnd = patch.atPeriodEnd
    return result
  }
  if (typeof patch === 'object' && patch !== null && typeof base === 'object' && base !== null) {
    const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [key, value] of Object.entries(patch)) {
      if (value == null) continue
      merged[key] = key in merged ? mergeValue(merged[key], value) : value
    }
    return merged
  }
  return base
}

export function mergeMessages(base: CancelFlowMessages, patch: MessagesPatch | undefined): CancelFlowMessages {
  if (!patch) return base
  return mergeValue(base, patch) as CancelFlowMessages
}

export function resolveLocale(explicit?: string): string {
  if (explicit) return explicit
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language
  return 'en'
}

// Fallback chain, least to most specific: 'en' first so an English override
// still shows through a partial regional catalog, then the base language,
// then the exact tag. Keys are matched case-insensitively ('pt-BR' ≡ 'pt-br').
function localeChain(locale: string): string[] {
  const exact = locale.toLowerCase()
  const base = exact.split('-')[0]
  const chain = ['en']
  if (base !== 'en') chain.push(base)
  if (exact !== base) chain.push(exact)
  return chain
}

function applyLocaleLayer(
  base: CancelFlowMessages,
  byLang: Record<string, MessagesPatch> | undefined,
  chain: string[],
): CancelFlowMessages {
  if (!byLang) return base
  const byLowerKey = new Map(Object.entries(byLang).map(([k, v]) => [k.toLowerCase(), v]))
  let resolved = base
  for (const lang of chain) {
    resolved = mergeMessages(resolved, byLowerKey.get(lang))
  }
  return resolved
}

/**
 * Resolve the full catalog for a locale. Layers, lowest to highest: built-in
 * defaults, then `orgMessages` (dashboard-configured overrides delivered on
 * the token-mode config), then the config's own per-locale messages — the
 * developer's overrides always end up on top. Both per-language layers run
 * through the same locale fallback chain.
 */
export function buildMessages(i18n?: I18nConfig, orgMessages?: Record<string, MessagesPatch>): CancelFlowMessages {
  const chain = localeChain(resolveLocale(i18n?.locale))
  return applyLocaleLayer(applyLocaleLayer(defaultMessages, orgMessages, chain), i18n?.messages, chain)
}
