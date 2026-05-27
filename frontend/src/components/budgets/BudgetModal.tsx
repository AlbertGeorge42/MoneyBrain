import React, { useEffect, useState } from 'react'
import { Modal, Drawer, Button, Tabs, theme } from 'antd'

const MOBILE_BREAKPOINT = 860

interface TabItem {
  key: string
  label: string
  children: React.ReactNode
}

interface BudgetModalProps {
  visible: boolean
  title: string
  children?: React.ReactNode
  onSubmit?: () => Promise<void>
  onCancel: () => void
  showFooterButtons?: boolean
  submitButtonDisabled?: boolean
  extraFooterContent?: React.ReactNode
  bodyPaddingBottom?: number
  tabItems?: TabItem[]
  activeTab?: string
  onTabChange?: (key: string) => void
}

const BudgetModal: React.FC<BudgetModalProps> = ({
  visible,
  title,
  children,
  onSubmit,
  onCancel,
  showFooterButtons = true,
  submitButtonDisabled = false,
  extraFooterContent,
  bodyPaddingBottom,
  tabItems,
  activeTab,
  onTabChange,
}) => {
  const [isMobile, setIsMobile] = useState(false)
  const { token } = theme.useToken()

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const renderContent = () => {
    if (!tabItems || !onTabChange || activeTab === undefined) {
      return children
    }
    return (
      <Tabs
        activeKey={activeTab}
        onChange={onTabChange}
        items={tabItems.map(item => ({
          key: item.key,
          label: item.label,
          children: item.children,
        }))}
        destroyInactiveTabPane
      />
    )
  }

  if (isMobile) {
    return (
      <Drawer
        title={title}
        placement="bottom"
        height="85vh"
        open={visible}
        onClose={onCancel}
        destroyOnClose
        styles={{
          body: {
            paddingBottom: showFooterButtons ? bodyPaddingBottom ?? 80 : 24,
          },
        }}
      >
        {renderContent()}
        {showFooterButtons && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: `${token.padding}px`,
              borderTop: `var(--mb-border-width) var(--mb-border-style) ${token.colorBorderSecondary}`,
              background: token.colorBgContainer,
            }}
          >
            {extraFooterContent && React.cloneElement(extraFooterContent as React.ReactElement, {
              block: true,
              size: 'large',
            })}
            {onSubmit && (
              <Button
                type="primary"
                onClick={onSubmit}
                disabled={submitButtonDisabled}
                block
                size="large"
                style={extraFooterContent ? { marginTop: '8px' } : undefined}
              >
                确定
              </Button>
            )}
            <Button
              onClick={onCancel}
              block
              size="large"
              style={{ marginTop: '8px' }}
            >
              取消
            </Button>
          </div>
        )}
      </Drawer>
    )
  }

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={onCancel}
      footer={
        showFooterButtons ? (
          <>
            {extraFooterContent && React.cloneElement(extraFooterContent as React.ReactElement, {
              size: 'large',
            })}
            <Button onClick={onCancel} size="large">取消</Button>
            {onSubmit && (
              <Button
                type="primary"
                onClick={onSubmit}
                disabled={submitButtonDisabled}
                size="large"
              >
                确定
              </Button>
            )}
          </>
        ) : null
      }
      destroyOnClose
      width={520}
    >
      {renderContent()}
    </Modal>
  )
}

export default BudgetModal