export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'system'

const THEME_MODE_STORAGE_KEY = 'moneybrain-theme-mode'

function resolveSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(mode: ThemeMode): Theme {
  return mode === 'system' ? resolveSystemTheme() : mode
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'

  const storedMode = localStorage.getItem(THEME_MODE_STORAGE_KEY)
  if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
    return storedMode
  }

  return 'system'
}

export function getCurrentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: Theme): Theme {
  document.documentElement.setAttribute('data-theme', theme)
  return theme
}

export function setThemeMode(mode: ThemeMode): Theme {
  const resolvedTheme = resolveTheme(mode)
  localStorage.setItem(THEME_MODE_STORAGE_KEY, mode)
  return applyTheme(resolvedTheme)
}

export function initTheme(mode = getStoredThemeMode()): Theme {
  return setThemeMode(mode)
}

export function listenSystemThemeChange(callback: (theme: Theme) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (event: MediaQueryListEvent) => {
    callback(event.matches ? 'dark' : 'light')
  }

  mediaQuery.addEventListener('change', handler)
  return () => mediaQuery.removeEventListener('change', handler)
}
