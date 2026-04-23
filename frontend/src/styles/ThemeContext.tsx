/**
 * 主题上下文
 * 管理全局主题状态，使 Ant Design 和 React 组件能够响应主题变化
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { initTheme, getCurrentTheme, setTheme as setThemeUtil, toggleTheme as toggleThemeUtil, type Theme } from './utils'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

/**
 * 主题提供者组件
 * 包裹应用根组件，提供主题状态管理
 */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 初始化时读取当前主题
  const [theme, setThemeState] = useState<Theme>(() => {
    // 确保 DOM 上已设置主题属性
    initTheme()
    return getCurrentTheme()
  })

  // 监听 data-theme 属性变化（支持外部修改）
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          const newTheme = getCurrentTheme()
          setThemeState(newTheme)
        }
      })
    })

    observer.observe(document.documentElement, { attributes: true })
    return () => observer.disconnect()
  }, [])

  // 设置主题
  const handleSetTheme = useCallback((newTheme: Theme) => {
    setThemeUtil(newTheme)
    setThemeState(newTheme)
  }, [])

  // 切换主题
  const handleToggleTheme = useCallback(() => {
    const newTheme = toggleThemeUtil()
    setThemeState(newTheme)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme, toggleTheme: handleToggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * 使用主题上下文的 Hook
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
