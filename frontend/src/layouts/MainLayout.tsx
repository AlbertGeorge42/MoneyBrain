import React from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import {
  DashboardOutlined,
  TransactionOutlined,
  BarChartOutlined,
  ControlOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useTheme } from '../styles/ThemeContext'
import {
  colorBorder,
  colorSurface,
  colorText,
  fontSizeLg,
  spaceLg,
  radiusLg,
  borderWidth,
  borderStyle,
} from '../styles/tokens'

const { Sider, Content, Header } = Layout

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/transactions', icon: <TransactionOutlined />, label: '交易记录' },
  { key: '/reports', icon: <BarChartOutlined />, label: '财务报表' },
  { key: '/budgets', icon: <ControlOutlined />, label: '预算管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={200}
        theme={isDark ? 'dark' : 'light'}
        style={{ background: colorSurface }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: fontSizeLg,
          fontWeight: 'bold',
          color: colorText,
          borderBottom: `${borderWidth} ${borderStyle} ${colorBorder}`,
        }}>
          MoneyBrain
        </div>
        <Menu
          mode="inline"
          theme={isDark ? 'dark' : 'light'}
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: 0, background: colorSurface }}
        />
      </Sider>
      <Layout>
        <Header style={{
          background: colorSurface,
          padding: `0 ${spaceLg}`,
          borderBottom: `${borderWidth} ${borderStyle} ${colorBorder}`,
        }} />
        <Content style={{
          margin: spaceLg,
          background: colorSurface,
          padding: spaceLg,
          borderRadius: radiusLg,
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
