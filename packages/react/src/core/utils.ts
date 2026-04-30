import type { CSSProperties } from 'react'
import type { Appearance, AppearanceVariables } from './types'

export const BUILT_IN_STEP_TYPES: readonly string[] = ['survey', 'offer', 'feedback', 'confirm', 'success']

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Maps the typed `appearance.variables` field names to the underlying
// CSS custom properties. Light/dark variants live in CSS — these
// overrides apply on top of whichever scheme is active.
const VAR_MAP: Record<string, keyof AppearanceVariables> = {
  '--ck-color-primary': 'colorPrimary',
  '--ck-color-primary-hover': 'colorPrimaryHover',
  '--ck-color-bg': 'colorBackground',
  '--ck-color-text': 'colorText',
  '--ck-color-text-secondary': 'colorTextSecondary',
  '--ck-color-border': 'colorBorder',
  '--ck-color-danger': 'colorDanger',
  '--ck-color-success': 'colorSuccess',
  '--ck-font-family': 'fontFamily',
  '--ck-font-size': 'fontSize',
  '--ck-border-radius': 'borderRadius',
}

export function appearanceToStyle(appearance?: Appearance): CSSProperties | undefined {
  const variables = appearance?.variables
  if (!variables) return undefined

  const style: Record<string, string> = {}
  for (const [cssProp, varKey] of Object.entries(VAR_MAP)) {
    const value = variables[varKey]
    if (value) style[cssProp] = value
  }

  return Object.keys(style).length > 0 ? (style as CSSProperties) : undefined
}

// Step-level fallback titles when neither token-mode config nor local
// step config provide one. Offer and Success are absent — Offer falls back
// to `offer.copy.headline`, Success branches on outcome.
export const defaultTitles = {
  survey: 'Why are you cancelling?',
  feedback: 'Any other feedback?',
  confirm: 'Confirm cancellation',
} as const
