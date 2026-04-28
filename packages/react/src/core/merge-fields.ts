// Merge field substitution. Dashboard-authored copy carries placeholders like
// `{{CUSTOMER_NAME.FIRST|Jane}}` (field name, optional fallback after the pipe).
// The embed's TipTap editor wraps these in `<merge-field>` tags for its own UI,
// but the wrapper is transparent at render time — browsers render unknown tags
// as their text content, so only the `{{…}}` inside matters.
//
// Mirrors the embed's implementation in churnkey-embed/src/views/Wrapper.vue.

import type { EmbedCustomer } from './api-types'

export type MergeAttrs = Record<string, string>

const MERGE_FIELD_PATTERN = /{{([a-zA-Z0-9_.]+)\|([^}]*)}}/g

/**
 * Build the attribute map merge fields are resolved against. Mirrors the
 * embed's default set: customer name variants and custom attributes. Values
 * that aren't strings are coerced — dashboards emit merge fields into HTML,
 * and HTML only speaks strings.
 */
export function buildMergeAttrs(customer: EmbedCustomer | null | undefined): MergeAttrs {
  if (!customer) return {}
  const attrs: MergeAttrs = {}

  const fullName = customer.decorated?.customerName
  if (fullName) {
    attrs.CUSTOMER_NAME = fullName
    const [first, ...rest] = fullName.split(' ')
    attrs['CUSTOMER_NAME.FIRST'] = first
    if (rest.length) attrs['CUSTOMER_NAME.LAST'] = rest.join(' ')
  }

  if (customer.email) attrs.CUSTOMER_EMAIL = customer.email

  for (const [key, value] of Object.entries(customer.decorated?.customAttributes ?? {})) {
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
