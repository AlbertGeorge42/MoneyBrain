import React, { useEffect } from 'react'
import { Segmented } from 'antd'
import { usePersistedState } from '../../hooks/usePersistedState'

export interface ReportViewItem {
  key: string
  label: string
  content: React.ReactNode
}

interface ReportViewSwitcherProps {
  items: ReportViewItem[]
  className?: string
  /** sessionStorage key，用于跨 route 保持切换状态 */
  storageKey?: string
}

const ReportViewSwitcher: React.FC<ReportViewSwitcherProps> = ({ items, className, storageKey }) => {
  const fallbackKey = items[0]?.key ?? ''
  const [activeKey, setActiveKey] = usePersistedState(
    storageKey ?? `moneybrain:reports:view:${fallbackKey}`,
    fallbackKey,
  )

  useEffect(() => {
    if (!items.some((item) => item.key === activeKey)) {
      setActiveKey(fallbackKey)
    }
  }, [activeKey, items, fallbackKey, setActiveKey])

  const activeItem = items.find((item) => item.key === activeKey) ?? items[0]

  if (!activeItem) return null

  return (
    <div className={className}>
      <Segmented
        block
        value={activeKey}
        onChange={(value) => setActiveKey(String(value))}
        options={items.map((item) => ({
          label: item.label,
          value: item.key,
        }))}
      />
      <div className="report-view-switcher__panel">{activeItem.content}</div>
    </div>
  )
}

export default ReportViewSwitcher
