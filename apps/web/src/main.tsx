import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/global.css'
import { ThemeProvider, useTheme } from './styles/ThemeContext'
import { createThemeConfig, syncCssVars } from './styles/theme/config'
import { initTheme } from './styles/theme/mode'
import { ApiClientError } from './services/apiError'

// 首屏渲染前同步 CSS 变量，避免 useEffect 时序导致的闪烁
const initialTheme = initTheme()
syncCssVars(initialTheme === 'dark')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // 切回窗口时刷新已过期的数据，避免看到过期金额
      refetchOnWindowFocus: true,
      // 4xx 是业务/请求问题，重试没有意义；5xx 与网络错误才重试一次
      retry: (failureCount, error) => {
        if (error instanceof ApiClientError && error.status !== undefined) {
          if (error.status >= 400 && error.status < 500) return false
        }
        return failureCount < 1
      },
    },
  },
})

// eslint-disable-next-line react-refresh/only-export-components
const ThemedApp: React.FC = () => {
  const { theme: currentTheme } = useTheme()
  const isDark = currentTheme === 'dark'

  useEffect(() => {
    syncCssVars(isDark)
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
