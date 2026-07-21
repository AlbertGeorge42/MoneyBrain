import React from 'react'
import { Card, Segmented, Tag, theme } from 'antd'
import { CheckCircleOutlined, SunOutlined, MoonOutlined, DesktopOutlined } from '@ant-design/icons'
import { useTheme } from '../../styles/ThemeContext'

const themeOptions = [
  { value: 'light' as const, label: '浅色', icon: <SunOutlined /> },
  { value: 'dark' as const, label: '深色', icon: <MoonOutlined /> },
  { value: 'system' as const, label: '跟随系统', icon: <DesktopOutlined /> },
]

const ThemeSection: React.FC = () => {
  const { token } = theme.useToken()
  const { mode, theme: currentTheme, setThemeMode } = useTheme()

  const segmentedOptions = themeOptions.map((opt) => ({
    value: opt.value,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {opt.icon}
        <span>{opt.label}</span>
      </div>
    ),
  }))

  const effectiveLabel = mode === 'system'
    ? `跟随系统 / ${currentTheme === 'dark' ? '深色' : '浅色'}`
    : currentTheme === 'dark' ? '深色' : '浅色'

  return (
    <Card className="surface-card" title="外观主题">
      <div style={{ display: 'flex', alignItems: 'center', gap: token.paddingLG, flexWrap: 'wrap' }}>
        <Segmented
          value={mode}
          options={segmentedOptions}
          onChange={(val) => setThemeMode(val as 'light' | 'dark' | 'system')}
        />
        <Tag
          className="settings-theme-badge"
          icon={<CheckCircleOutlined />}
        >
          当前生效：{effectiveLabel}
        </Tag>
      </div>
    </Card>
  )
}

export default ThemeSection
