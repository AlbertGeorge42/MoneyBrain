import React from 'react'
import { Modal, Drawer, Button, Tabs, theme } from 'antd'
import { useIsMobile } from '../../hooks/useIsMobile'

interface TabItem {
  key: string
  label: string
  children: React.ReactNode
  disabled?: boolean
}

interface TransactionModalProps {
  visible: boolean
  title: string
  children?: React.ReactNode
  onSubmit?: () => Promise<void>
  onCancel: () => void
  showFooterButtons?: boolean
  submitButtonDisabled?: boolean
  extraFooterContent?: React.ReactNode
  bodyPaddingBottom?: number
  // Tabs 选项卡支持
  tabItems?: TabItem[]
  activeTab?: string
  onTabChange?: (key: string) => void
}

const TransactionModal: React.FC<TransactionModalProps> = ({
  visible,
  title,
  children,
  onSubmit,
  onCancel,
  showFooterButtons = true,
  submitButtonDisabled = false,
  extraFooterContent,
  bodyPaddingBottom,
  // Tabs
  tabItems,
  activeTab,
  onTabChange,
}) => {
  const isMobile = useIsMobile()
  const { token } = theme.useToken()

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
          disabled: item.disabled,
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

export default TransactionModal
