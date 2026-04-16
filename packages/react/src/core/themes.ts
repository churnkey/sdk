import type { ThemeVariables } from './types'

interface ThemeConfig {
  light: Partial<ThemeVariables>
  dark: Partial<ThemeVariables>
}

export const themes: Record<string, ThemeConfig> = {
  default: {
    light: {},
    dark: {
      colorPrimary: '#3b82f6',
      colorPrimaryHover: '#60a5fa',
      colorBackground: '#18181b',
      colorText: '#fafafa',
      colorTextSecondary: '#a1a1aa',
      colorBorder: '#27272a',
      colorDanger: '#f87171',
      colorSuccess: '#34d399',
    },
  },

  minimal: {
    light: {
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
    dark: {
      colorPrimary: '#fafafa',
      colorPrimaryHover: '#d4d4d8',
      colorBackground: '#09090b',
      colorText: '#fafafa',
      colorTextSecondary: '#71717a',
      colorBorder: '#27272a',
      colorDanger: '#f87171',
      colorSuccess: '#4ade80',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      borderRadius: '8px',
    },
  },

  rounded: {
    light: {
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
    dark: {
      colorPrimary: '#a78bfa',
      colorPrimaryHover: '#c4b5fd',
      colorBackground: '#0f0d1a',
      colorText: '#ede9fe',
      colorTextSecondary: '#7c7c8a',
      colorBorder: '#2e2b3d',
      colorDanger: '#f87171',
      colorSuccess: '#34d399',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '15px',
      borderRadius: '16px',
    },
  },

  corporate: {
    light: {
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
    dark: {
      colorPrimary: '#94a3b8',
      colorPrimaryHover: '#cbd5e1',
      colorBackground: '#0f172a',
      colorText: '#f1f5f9',
      colorTextSecondary: '#64748b',
      colorBorder: '#1e293b',
      colorDanger: '#f87171',
      colorSuccess: '#4ade80',
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      borderRadius: '6px',
    },
  },
}
