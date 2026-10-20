import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  getCurrentTheme,
  getStoredThemeMode,
  initTheme,
  listenSystemThemeChange,
  setThemeMode as setThemeModeUtil,
  type Theme,
  type ThemeMode,
} from './theme/mode'

interface ThemeContextType {
  mode: ThemeMode
  theme: Theme
  isDark: boolean
  setThemeMode: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredThemeMode())
  const [theme, setTheme] = useState<Theme>(() => {
    initTheme()
    return getCurrentTheme()
  })

  useEffect(() => {
    const nextTheme = initTheme(mode)
    setTheme(nextTheme)

    if (mode !== 'system') {
      return undefined
    }

    return listenSystemThemeChange((systemTheme) => {
      setTheme(systemTheme)
    })
  }, [mode])

  const value = useMemo<ThemeContextType>(() => {
    const setThemeMode = (nextMode: ThemeMode) => {
      setThemeModeUtil(nextMode)
      setMode(nextMode)
      setTheme(getCurrentTheme())
    }

    const toggleTheme = () => {
      const nextMode = theme === 'dark' ? 'light' : 'dark'
      setThemeModeUtil(nextMode)
      setMode(nextMode)
      setTheme(nextMode)
    }

    return {
      mode,
      theme,
      isDark: theme === 'dark',
      setThemeMode,
      toggleTheme,
    }
  }, [mode, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}
