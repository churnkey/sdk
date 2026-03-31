import type { ThemeVariables } from './types'

export const darkDefaults: Partial<ThemeVariables> = {
  colorPrimary: '#3b82f6',
  colorPrimaryHover: '#60a5fa',
  colorBackground: '#18181b',
  colorText: '#fafafa',
  colorTextSecondary: '#a1a1aa',
  colorBorder: '#27272a',
  colorDanger: '#f87171',
  colorSuccess: '#34d399',
}

export const themes: Record<string, Partial<ThemeVariables>> = {
  default: {
    // Intentionally empty — uses the CSS defaults in cancel-flow.css
  },

  minimal: {
    colorPrimary: '#18181b',
    colorPrimaryHover: '#27272a',
    colorBackground: '#fafafa',
    colorText: '#18181b',
    colorTextSecondary: '#a1a1aa',
    colorBorder: '#e4e4e7',
    colorDanger: '#dc2626',
    colorSuccess: '#16a34a',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    borderRadius: '8px',
  },

  rounded: {
    colorPrimary: '#8b5cf6',
    colorPrimaryHover: '#7c3aed',
    colorBackground: '#ffffff',
    colorText: '#1e1b4b',
    colorTextSecondary: '#6b7280',
    colorBorder: '#e5e7eb',
    colorDanger: '#ef4444',
    colorSuccess: '#10b981',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '15px',
    borderRadius: '16px',
  },

  corporate: {
    colorPrimary: '#0f172a',
    colorPrimaryHover: '#1e293b',
    colorBackground: '#ffffff',
    colorText: '#0f172a',
    colorTextSecondary: '#64748b',
    colorBorder: '#cbd5e1',
    colorDanger: '#b91c1c',
    colorSuccess: '#15803d',
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    borderRadius: '6px',
  },
}
