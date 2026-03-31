import { useEffect, useState } from 'react'

type ColorScheme = 'light' | 'dark'

const query = '(prefers-color-scheme: dark)'

function getSystemScheme(): ColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia(query).matches ? 'dark' : 'light'
}

export function useColorScheme(preference?: 'auto' | 'light' | 'dark'): ColorScheme {
  const [system, setSystem] = useState(getSystemScheme)

  useEffect(() => {
    if (preference !== 'auto' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setSystem(mql.matches ? 'dark' : 'light')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [preference])

  if (!preference || preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return system
}
