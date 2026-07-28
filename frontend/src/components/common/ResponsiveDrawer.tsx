import React from 'react'
import { Drawer, theme } from 'antd'
import { useIsMobile } from '../../hooks/useIsMobile'

interface ResponsiveDrawerProps {
  /** 是否可见 */
  visible: boolean
  /** 抽屉标题 */
  title: string
  /** 抽屉内容 */
  children: React.ReactNode
  /** 关闭回调 */
  onCancel: () => void
  /** 桌面端宽度，默认 480 */
  width?: number
  /** 移动端高度，默认 85vh */
  height?: string
  /** 底部固定区域（如操作按钮），固定在抽屉底部不随内容滚动 */
  footer?: React.ReactNode
}

/**
 * 统一响应式抽屉组件
 * - 桌面端：右侧抽屉
 * - 移动端：底部抽屉（85vh）
 *
 * 提供统一的响应式抽屉行为。
 */
const ResponsiveDrawer: React.FC<ResponsiveDrawerProps> = ({
  visible,
  title,
  children,
  onCancel,
  width = 480,
  height = '85vh',
  footer,
}) => {
  const isMobile = useIsMobile()
  const { token } = theme.useToken()

  return (
    <Drawer
      title={title}
      placement={isMobile ? 'bottom' : 'right'}
      width={isMobile ? '100%' : width}
      height={isMobile ? height : '100vh'}
      open={visible}
      onClose={onCancel}
      destroyOnClose
      closable
      closeIcon={
        <span style={{ fontSize: 18, lineHeight: 1, color: token.colorTextSecondary }}>×</span>
      }
      footer={footer}
      styles={{
        header: {
          borderBottom: `var(--mb-border-width) var(--mb-border-style) ${token.colorBorderSecondary}`,
          padding: token.paddingXS,
        },
        title: {
          fontSize: token.fontSizeLG,
          fontWeight: 600,
          lineHeight: `${token.lineHeightLG}`,
        },
        body: {
          overflowY: 'auto',
          padding: token.paddingLG,
        },
      }}
    >
      {children}
    </Drawer>
  )
}

export default ResponsiveDrawer