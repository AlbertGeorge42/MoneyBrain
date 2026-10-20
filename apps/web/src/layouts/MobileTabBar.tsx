import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  DashboardOutlined,
  TransactionOutlined,
  BarChartOutlined,
  ControlOutlined,
  SettingOutlined,
} from '@ant-design/icons'

interface TabItem {
  key: string
  icon: React.ReactNode
  label: string
}

const tabs: TabItem[] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/transactions', icon: <TransactionOutlined />, label: '交易' },
  { key: '/reports', icon: <BarChartOutlined />, label: '报表' },
  { key: '/budgets', icon: <ControlOutlined />, label: '预算' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

const MobileTabBar: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const currentPath = location.pathname

  return (
    <nav className="mobile-tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`mobile-tab-bar__item ${currentPath === tab.key ? 'mobile-tab-bar__item--active' : ''}`}
          onClick={() => navigate(tab.key)}
        >
          <span className="mobile-tab-bar__icon">{tab.icon}</span>
          <span className="mobile-tab-bar__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

export default MobileTabBar
