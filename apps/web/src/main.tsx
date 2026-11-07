import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import App from './App'
import './styles/global.css'
import { hfTheme, mbColorSchemeManager, mbCssVariablesResolver } from './styles/theme/hf-theme'
import { ApiClientError } from './services/apiError'

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

// 主题唯一来源：MantineProvider 的 colorScheme（light / dark / auto）+ cssVariablesResolver 输出 --mb-*。
// 首次绘制前由 index.html 的内联脚本同步 color-scheme 属性，避免深浅闪烁。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={hfTheme}
        cssVariablesResolver={mbCssVariablesResolver}
        colorSchemeManager={mbColorSchemeManager}
        defaultColorScheme="auto"
      >
        <App />
      </MantineProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
