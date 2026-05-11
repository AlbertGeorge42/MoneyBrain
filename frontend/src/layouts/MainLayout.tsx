import React, { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import {
  BarChartOutlined,
  ControlOutlined,
  DashboardOutlined,
  SettingOutlined,
  TransactionOutlined,
} from '@ant-design/icons'
import { MobileTabBar } from '../components/common'

const { Sider, Content } = Layout

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
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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
