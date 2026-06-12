import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// eslint-disable-next-line react-refresh/only-export-components
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
      {/* antd <App> 必须在 ConfigProvider 内、Router 外，让 useApp() 能取到主题感知的 message/notification/modal 实例 */}
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
