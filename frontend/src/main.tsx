import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/global.css'
import { ThemeProvider, useTheme } from './styles/ThemeContext'
import { getAntdTheme } from './styles/antd-theme'

/**
 * 内部组件，用于获取主题状态并配置 Ant Design
 */
const ThemedApp: React.FC = () => {
  const { theme: currentTheme } = useTheme()
  const isDark = currentTheme === 'dark'

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        ...getAntdTheme(isDark),
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
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
