import { darkThemeValues } from './dark'
import { lightThemeValues } from './light'

export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'system'

const THEME_MODE_STORAGE_KEY = 'moneybrain-theme-mode'
const LEGACY_THEME_STORAGE_KEY = 'moneybrain-theme'

function resolveSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'

  const storedMode = localStorage.getItem(THEME_MODE_STORAGE_KEY)
  if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
    return storedMode
  }

  const legacyMode = localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
  if (legacyMode === 'light' || legacyMode === 'dark') {
    return legacyMode
  }

  return 'system'
}

function resolveTheme(mode: ThemeMode): Theme {
  return mode === 'system' ? resolveSystemTheme() : mode
}

export function getCurrentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): Theme {
  document.documentElement.setAttribute('data-theme', theme)
  return theme
}

export function setThemeMode(mode: ThemeMode): Theme {
  const resolvedTheme = resolveTheme(mode)
  localStorage.setItem(THEME_MODE_STORAGE_KEY, mode)
  localStorage.setItem(LEGACY_THEME_STORAGE_KEY, resolvedTheme)
  return applyTheme(resolvedTheme)
}

export function initTheme(mode = getStoredThemeMode()): Theme {
  return setThemeMode(mode)
}

export function setTheme(theme: Theme): Theme {
  localStorage.setItem(THEME_MODE_STORAGE_KEY, theme)
  localStorage.setItem(LEGACY_THEME_STORAGE_KEY, theme)
  return applyTheme(theme)
}

export function toggleTheme(): Theme {
  const currentTheme = getCurrentTheme()
  const nextTheme: Theme = currentTheme === 'light' ? 'dark' : 'light'
  return setTheme(nextTheme)
}

export function listenSystemThemeChange(callback: (theme: Theme) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (event: MediaQueryListEvent) => {
    callback(event.matches ? 'dark' : 'light')
  }

  mediaQuery.addEventListener('change', handler)
  return () => mediaQuery.removeEventListener('change', handler)
}

export { lightThemeValues, darkThemeValues }
