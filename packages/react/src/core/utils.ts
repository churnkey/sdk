import type { CSSProperties } from 'react'
import { defaultMessages } from './messages'
import type { Appearance, AppearanceVariables } from './types'

export const BUILT_IN_STEP_TYPES: readonly string[] = ['survey', 'offer', 'feedback', 'confirm', 'success']
export const BUILT_IN_OFFER_TYPES: readonly string[] = [
  'discount',
  'pause',
  'trial_extension',
  'plan_change',
  'contact',
  'redirect',
  'rebate',
]

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Maps the typed `appearance.variables` field names to the underlying
// CSS custom properties. Light/dark variants live in CSS — these
// overrides apply on top of whichever scheme is active.
const VAR_MAP: Record<string, keyof AppearanceVariables> = {
  // Surfaces
  '--ck-color-bg': 'colorBackground',
  '--ck-color-surface': 'colorSurface',
  '--ck-color-surface-muted': 'colorSurfaceMuted',

  // Borders
  '--ck-color-border': 'colorBorder',
  '--ck-color-border-strong': 'colorBorderStrong',

  // Text
  '--ck-color-text': 'colorText',
  '--ck-color-text-secondary': 'colorTextSecondary',
  '--ck-color-text-muted': 'colorTextMuted',

  // Primary
  '--ck-color-primary': 'colorPrimary',
  '--ck-color-primary-hover': 'colorPrimaryHover',
  '--ck-color-primary-soft': 'colorPrimarySoft',

  // Semantic
  '--ck-color-success': 'colorSuccess',
  '--ck-color-success-soft': 'colorSuccessSoft',
  '--ck-color-danger': 'colorDanger',
  '--ck-color-danger-hover': 'colorDangerHover',
  '--ck-color-danger-soft': 'colorDangerSoft',

  // Typography
  '--ck-font-family': 'fontFamily',
  '--ck-font-mono': 'fontFamilyMono',
  '--ck-font-display': 'fontFamilyDisplay',
  '--ck-font-size': 'fontSize',
  '--ck-step-title-weight': 'fontWeightDisplay',
  '--ck-step-title-letter-spacing': 'letterSpacingDisplay',

  // Geometry
  '--ck-border-radius': 'borderRadius',
  '--ck-radius-sm': 'radiusSm',
  '--ck-radius-md': 'radiusMd',
  '--ck-radius-lg': 'radiusLg',
  '--ck-radius-xl': 'radiusXl',

  // Elevation
  '--ck-shadow-modal': 'shadowModal',
  '--ck-shadow-card': 'shadowCard',

  // Overlay
  '--ck-overlay-color': 'overlayColor',
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
// to `offer.copy.headline`, Success branches on outcome. Kept for backwards
// compatibility; the renderer now reads titles from the message catalog,
// which these mirror.
export const defaultTitles = {
  survey: defaultMessages.survey.title,
  feedback: defaultMessages.feedback.title,
  confirm: defaultMessages.confirm.title,
} as const
