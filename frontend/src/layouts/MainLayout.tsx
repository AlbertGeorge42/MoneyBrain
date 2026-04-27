import React, { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button, Dropdown, Layout, Menu, Segmented, Tag } from 'antd'
import type { MenuProps } from 'antd'
import {
  BarChartOutlined,
  ControlOutlined,
  DashboardOutlined,
  MoonOutlined,
  PlusOutlined,
  SettingOutlined,
  SunOutlined,
  TransactionOutlined,
} from '@ant-design/icons'
import { useTheme } from '../styles/ThemeContext'
import { MobileTabBar } from '../components/common'

const { Sider, Header, Content } = Layout

const pageMeta: Record<string, { title: string; description: string }> = {
  '/dashboard': {
    title: '财务总览',
    description: '净资产、收支与近期变化。',
  },
  '/transactions': {
    title: '交易记录',
    description: '录入、筛选与修正。',
  },
  '/reports': {
    title: '财务报表',
    description: '资产、收支、现金流与投资。',
  },
  '/budgets': {
    title: '预算管理',
    description: '预算模块待重做。',
  },
  '/settings': {
    title: '设置与数据',
    description: '主题、备份与高风险操作。',
  },
}

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/transactions', icon: <TransactionOutlined />, label: '交易记录' },
  { key: '/reports', icon: <BarChartOutlined />, label: '财务报表' },
  { key: '/budgets', icon: <ControlOutlined />, label: '预算管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

const MOBILE_BREAKPOINT = 860

const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, theme, setThemeMode } = useTheme()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const currentPage = pageMeta[location.pathname] ?? pageMeta['/dashboard']

  const themeMenuItems: MenuProps['items'] = [
    {
      key: 'light',
      icon: <SunOutlined />,
      label: '浅色',
      onClick: () => setThemeMode('light'),
    },
    {
      key: 'dark',
      icon: <MoonOutlined />,
      label: '深色',
      onClick: () => setThemeMode('dark'),
    },
    {
      key: 'system',
      label: '系统',
      onClick: () => setThemeMode('system'),
    },
  ]

  return (
    <Layout className="app-shell">
      <Sider className="app-shell__sider" width={244}>
        <div className="app-shell__brand">
          <span className="app-shell__brand-mark">M</span>
          <div className="app-shell__brand-copy">
            <h1 className="app-shell__brand-title">MoneyBrain</h1>
            <p className="app-shell__brand-subtitle">
              Accounts, cash flow, reports.
            </p>
          </div>
          <Tag className="status-chip" bordered={false}>
            当前主题 {mode === 'system' ? `系统 / ${theme === 'dark' ? '深色' : '浅色'}` : theme === 'dark' ? '深色' : '浅色'}
          </Tag>
        </div>

        <Menu
          className="app-shell__menu"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout className="app-shell__body">
        <Header className="app-shell__header">
          <div className="app-shell__toolbar">
            <div className="app-shell__toolbar-copy">
              <span className="app-shell__toolbar-label app-shell__toolbar-label--desktop-only">Workspace</span>
              <h2 className="app-shell__toolbar-title">{currentPage.title}</h2>
              <p className="app-shell__toolbar-meta app-shell__toolbar-meta--desktop-only">{currentPage.description}</p>
            </div>

            <div className="app-shell__toolbar-actions">
              {isMobile ? (
                <>
                  <Dropdown menu={{ items: themeMenuItems }} trigger={['click']}>
                    <Button icon={theme === 'dark' ? <MoonOutlined /> : <SunOutlined />} />
                  </Dropdown>
                  <Button onClick={() => navigate('/transactions')} type="primary" icon={<PlusOutlined />} />
                </>
              ) : (
                <>
                  <Segmented
                    value={mode}
                    options={[
                      {
                        label: (
                          <span>
                            <SunOutlined /> 浅色
                          </span>
                        ),
                        value: 'light',
                      },
                      {
                        label: (
                          <span>
                            <MoonOutlined /> 深色
                          </span>
                        ),
                        value: 'dark',
                      },
                      {
                        label: '系统',
                        value: 'system',
                      },
                    ]}
                    onChange={(value) => setThemeMode(value as 'light' | 'dark' | 'system')}
                  />
                  <Button onClick={() => navigate('/transactions')} type="primary">
                    快速记一笔
                  </Button>
                </>
              )}
            </div>
          </div>
        </Header>

        <Content className="app-shell__content">
          <div className="page-shell">
            <Outlet />
          </div>
        </Content>
      </Layout>

      {isMobile && <MobileTabBar />}
    </Layout>
  )
}

export default MainLayout
