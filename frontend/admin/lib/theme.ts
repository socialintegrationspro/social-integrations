import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'sint-theme'

// The choice is a per-browser convenience, so it lives in localStorage.
// Without a saved choice the app follows the system setting.
function initial(): Theme {
  try {
    const saved = window.localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* storage blocked */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.getElementById('sint-app')?.setAttribute('data-theme', theme)
  document.body.classList.toggle('sint-light', theme === 'light')
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initial)
  useEffect(() => applyTheme(theme), [theme])
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark'
      try {
        window.localStorage.setItem(KEY, next)
      } catch {
        /* storage blocked */
      }
      return next
    })
  }, [])
  return [theme, toggle]
}

export const initialTheme = initial
