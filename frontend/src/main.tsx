import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/global.css'
import { ThemeProvider, useTheme } from './styles/ThemeContext'
import { createThemeConfig } from './styles/theme/config'
import { initTheme } from './styles/theme/mode'
import { syncLegacyCssVars } from './styles/theme/cssVars'

// 首屏渲染前同步 legacy CSS 变量，避免 useEffect 时序导致的闪烁
const initialTheme = initTheme()
syncLegacyCssVars(initialTheme === 'dark')

const ThemedApp: React.FC = () => {
  const { theme: currentTheme } = useTheme()
  const isDark = currentTheme === 'dark'

  useEffect(() => {
    syncLegacyCssVars(isDark)
  }, [isDark])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={createThemeConfig(isDark)}
    >
      <App />
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  </React.StrictMode>,
)
