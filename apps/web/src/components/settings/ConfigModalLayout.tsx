import React from 'react'
import { Modal, Tabs } from 'antd'
import type { TabsProps } from 'antd'

interface ConfigModalLayoutTabs {
  items: TabsProps['items']
  activeKey?: string
  onChange?: (key: string) => void
  tabBarExtraContent?: React.ReactNode
}

interface ConfigModalLayoutProps {
  /** 弹窗标题 */
  title: string
  /** 是否可见 */
  visible: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 弹窗宽度，默认 700 */
  width?: number | string
  /** Tabs 配置，不传则渲染 children */
  tabs?: ConfigModalLayoutTabs
  /** 自定义内容（无 Tabs 时使用） */
  children?: React.ReactNode
  /** Modal 样式 */
  styles?: React.ComponentProps<typeof Modal>['styles']
}

const ConfigModalLayout: React.FC<ConfigModalLayoutProps> = ({
  title,
  visible,
  onClose,
  width = 700,
  tabs,
  children,
  styles,
}) => (
  <Modal
    title={title}
    open={visible}
    onCancel={onClose}
    footer={null}
    width={width}
    styles={styles}
  >
    {tabs ? (
      <Tabs
        items={tabs.items}
        activeKey={tabs.activeKey}
        onChange={tabs.onChange}
        tabBarExtraContent={tabs.tabBarExtraContent}
      />
    ) : (
      children
    )}
  </Modal>
)

export default ConfigModalLayout
