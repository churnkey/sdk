import type { CSSProperties } from 'react'
import { darkDefaults, themes } from './themes'
import type { Appearance, ThemeVariables } from './types'

export const BUILT_IN_STEP_TYPES: readonly string[] = ['survey', 'offer', 'feedback', 'confirm', 'success']

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

const VAR_MAP: Record<string, keyof ThemeVariables> = {
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

export function appearanceToStyle(
  appearance?: Appearance,
  resolvedScheme: 'light' | 'dark' = 'light',
): CSSProperties | undefined {
  const dark = resolvedScheme === 'dark' ? darkDefaults : undefined
  const themeVars = appearance?.theme ? themes[appearance.theme] : undefined
  // dark defaults → theme preset → explicit overrides
  const merged = { ...dark, ...themeVars, ...appearance?.variables }

  if (Object.keys(merged).length === 0) return undefined

  const style: Record<string, string> = {}
  for (const [cssProp, varKey] of Object.entries(VAR_MAP)) {
    const value = merged[varKey]
    if (value) style[cssProp] = value
  }

  return Object.keys(style).length > 0 ? (style as CSSProperties) : undefined
}

export const defaultTitles: Record<string, string> = {
  survey: 'Why are you cancelling?',
  offer: 'Before you go...',
  feedback: 'Any other feedback?',
  confirm: 'Confirm cancellation',
  success: '',
}
