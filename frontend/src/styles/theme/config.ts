import { theme, type ThemeConfig } from 'antd'
import { baseSeed } from './seed'
import { getComponentTokens } from './components'

export function createThemeConfig(isDark: boolean): ThemeConfig {
  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    cssVar: {
      prefix: 'mb',
      key: isDark ? 'dark' : 'light',
    },
    token: baseSeed,
    components: getComponentTokens(),
  }
}