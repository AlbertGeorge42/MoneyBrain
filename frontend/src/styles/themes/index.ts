/**
 * 主题生成器与切换逻辑
 * 负责生成 CSS 变量字符串和主题切换功能
 */

import { lightThemeValues } from './light'
import { darkThemeValues } from './dark'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'moneybrain-theme'

/**
 * 生成 CSS 变量声明字符串
 */
function generateCssVariables(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n  ')
}

/**
 * 生成完整主题 CSS
 */
export function generateThemeCss(): string {
  const lightVars = generateCssVariables(lightThemeValues)
  const darkVars = generateCssVariables(darkThemeValues)

  return `
/* MoneyBrain Design Tokens - Auto-generated */
:root {
  ${lightVars}
}

[data-theme="dark"] {
  ${darkVars}
}
`
}

/**
 * 获取当前主题
 */
export function getCurrentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'dark' ? 'dark' : 'light'
}

/**
 * 设置主题
 */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

/**
 * 切换主题
 */
export function toggleTheme(): Theme {
  const current = getCurrentTheme()
  const next = current === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

/**
 * 初始化主题
 * 优先使用本地存储，其次跟随系统偏好
 */
export function initTheme(): Theme {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
  if (saved && (saved === 'light' || saved === 'dark')) {
    document.documentElement.setAttribute('data-theme', saved)
    return saved
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = prefersDark ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme)
  return theme
}

/**
 * 监听系统主题变化
 */
export function listenSystemThemeChange(callback: (theme: Theme) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => {
    const theme = e.matches ? 'dark' : 'light'
    callback(theme)
  }
  mediaQuery.addEventListener('change', handler)
  return () => mediaQuery.removeEventListener('change', handler)
}

export { lightThemeValues, darkThemeValues }
