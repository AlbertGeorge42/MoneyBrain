import React, { useEffect, useState } from 'react'
import { Segmented } from 'antd'

export interface ReportViewItem {
  key: string
  label: string
  content: React.ReactNode
}

interface ReportViewSwitcherProps {
  items: ReportViewItem[]
  className?: string
}

const ReportViewSwitcher: React.FC<ReportViewSwitcherProps> = ({ items, className }) => {
  const [activeKey, setActiveKey] = useState(items[0]?.key ?? '')

  useEffect(() => {
    if (!items.some((item) => item.key === activeKey)) {
      setActiveKey(items[0]?.key ?? '')
    }
  }, [activeKey, items])

  const activeItem = items.find((item) => item.key === activeKey) ?? items[0]

  if (!activeItem) return null

  return (
    <div className={className}>
      <Segmented
        block
        className="report-view-switcher__control"
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
