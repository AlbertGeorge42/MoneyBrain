/**
 * 居中对话框唯一外壳：配置与 classNames 只在这里声明一次。
 *
 * 语义边界：Modal 只用于「就地确认 / 短表单」（批量操作、快速记账）；
 * 查看详情、编辑详情、下钻等带滚动内容与吸底动作区的场景一律用 Sheet 侧滑抽屉。
 * `opened` 必须由宿主布尔受控且组件常驻，条件挂载 + opened 恒 true 会丢动画。
 */
import { Modal as MantineModal, type ModalProps } from '@mantine/core'
import type { ReactNode } from 'react'

const CLASS_NAMES: ModalProps['classNames'] = {
  content: 'mb-shared-modal',
  header: 'mb-ov-overlay-head',
  title: 'mb-ov-title-wrap',
  body: 'mb-ov-body',
  overlay: 'mb-ov-overlay',
  close: 'mb-ov-close',
}

export function Modal({
  opened,
  onClose,
  title,
  children,
}: {
  opened: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
}) {
  return (
    <MantineModal
      opened={opened}
      onClose={onClose}
      centered
      size="auto"
      withinPortal={false}
      title={title}
      classNames={CLASS_NAMES}
    >
      {children}
    </MantineModal>
  )
}
