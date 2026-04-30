// Merge field substitution for dashboard-authored copy. Placeholders look
// like `{{CUSTOMER_NAME.FIRST|Jane}}` — field name, optional fallback after
// the pipe. Copy can also arrive wrapped in `<merge-field>` tags (the
// dashboard editor uses them for its own UI); browsers render unknown tags
// as their text content, so the wrapper is transparent and only the inner
// `{{…}}` needs substitution.

import type { DirectCustomer, FeedbackStep, OfferDecision, OfferStep, ReasonConfig, Step, SurveyStep } from './types'

export type MergeAttrs = Record<string, string>

const MERGE_FIELD_PATTERN = /{{([a-zA-Z0-9_.]+)\|([^}]*)}}/g

/**
 * Build the attribute map merge fields are resolved against. Sourced from
 * Direct.Customer fields: name (with `.FIRST`/`.LAST` variants), email, and
 * metadata. Values that aren't strings are coerced — dashboards emit merge
 * fields into HTML, and HTML only speaks strings.
 */
export function buildMergeAttrs(customer: DirectCustomer | null | undefined): MergeAttrs {
  if (!customer) return {}
  const attrs: MergeAttrs = {}

  // Build full name from Direct.Customer's separate first/last name fields.
  const first = customer.name
  const last = customer.lastName
  const fullName = [first, last].filter(Boolean).join(' ') || undefined
  if (fullName) attrs.CUSTOMER_NAME = fullName
  if (first) attrs['CUSTOMER_NAME.FIRST'] = first
  if (last) attrs['CUSTOMER_NAME.LAST'] = last

  if (customer.email) attrs.CUSTOMER_EMAIL = customer.email

  for (const [key, value] of Object.entries(customer.metadata ?? {})) {
    if (value != null) attrs[key] = String(value)
  }

  return attrs
}

/**
 * Replace `{{FIELD|fallback}}` placeholders in `text` with values from `attrs`.
 * Missing keys fall back to the `|…}}` segment (which may be empty). The
 * enclosing `<merge-field>` wrapper, if any, is left as-is — browsers ignore
 * unknown tags and render their children, so the visible output is correct.
 */
export function applyMergeFields(text: string, attrs: MergeAttrs): string {
  if (!text?.includes('{{')) return text
  return text.replace(MERGE_FIELD_PATTERN, (_match, field: string, fallback: string) => attrs[field] ?? fallback)
}

/**
 * Substitute merge fields across a Step[] tree. Called once at machine init
 * so the runtime carries already-resolved copy — components stay unaware of
 * merge fields entirely.
 */
export function applyMergeFieldsToSteps(steps: Step[], customer: DirectCustomer | null | undefined): Step[] {
  const attrs = buildMergeAttrs(customer)
  return steps.map((step) => mergeStep(step, attrs))
}

function mergeStep(step: Step, attrs: MergeAttrs): Step {
  // CustomStepConfig.type is `string`, so a literal-string switch doesn't
  // narrow it out of the union — each branch needs an explicit cast.
  switch (step.type) {
    case 'survey': {
      const s = step as SurveyStep
      return {
        ...s,
        title: maybeMerge(s.title, attrs),
        description: maybeMerge(s.description, attrs),
        reasons: s.reasons.map((r) => mergeReason(r, attrs)),
      }
    }
    case 'offer': {
      const s = step as OfferStep
      return {
        ...s,
        title: maybeMerge(s.title, attrs),
        description: maybeMerge(s.description, attrs),
        offer: s.offer ? mergeOfferDecision(s.offer, attrs) : undefined,
      }
    }
    case 'feedback': {
      const s = step as FeedbackStep
      return {
        ...s,
        title: maybeMerge(s.title, attrs),
        description: maybeMerge(s.description, attrs),
        placeholder: maybeMerge(s.placeholder, attrs),
      }
    }
    case 'success':
      // savedTitle/cancelledTitle/etc. are picked at render time based on the
      // outcome; merge substitution can be added there if it's ever needed.
      return step
    default: {
      const s = step as { title?: string; description?: string }
      return { ...step, title: maybeMerge(s.title, attrs), description: maybeMerge(s.description, attrs) }
    }
  }
}

function mergeReason(r: ReasonConfig, attrs: MergeAttrs): ReasonConfig {
  return { ...r, label: applyMergeFields(r.label, attrs) }
}

function mergeOfferDecision(o: OfferDecision, attrs: MergeAttrs): OfferDecision {
  return {
    ...o,
    copy: {
      headline: applyMergeFields(o.copy.headline, attrs),
      body: applyMergeFields(o.copy.body, attrs),
      cta: applyMergeFields(o.copy.cta, attrs),
      declineCta: applyMergeFields(o.copy.declineCta, attrs),
    },
  }
}

function maybeMerge(text: string | undefined, attrs: MergeAttrs): string | undefined {
  return text ? applyMergeFields(text, attrs) : text
}
