import { App } from 'antd'
import { useMemo } from 'react'

// 业务侧统一提示入口：从 antd <App> 上下文中取 message 实例，
// 自动跟随 ConfigProvider 的主题与语言。
export function useNotify() {
  const { message } = App.useApp()
  return useMemo(
    () => ({
      success: message.success,
      error: message.error,
      warning: message.warning,
      info: message.info,
      loading: message.loading,
    }),
    [message],
  )
}
