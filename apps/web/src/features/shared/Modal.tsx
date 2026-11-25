/**
 * 居中对话框唯一外壳：配置与 classNames 只在这里声明一次。
 *
 * 语义边界：Modal 只用于「就地确认 / 短表单」（批量操作、快速记账）；
 * 查看详情、编辑详情、下钻等带滚动内容与吸底动作区的场景一律用 Sheet 侧滑抽屉。
 * `opened` 必须由宿主布尔受控且组件常驻，条件挂载 + opened 恒 true 会丢动画。
 *
 * 与 Sheet 共用 Overlay 契约：actions 是唯一 Footer API，children 进独立滚动 Body，
 * Footer 固定且右对齐；打开时同样登记 overlay registry，禁用全局「记一笔」入口。
 */
import { Modal as MantineModal, type ModalProps } from '@mantine/core'
import { useEffect, type ReactNode } from 'react'
import { registerOverlay } from './overlayPresence'

const CLASS_NAMES: ModalProps['classNames'] = {
  content: 'mb-shared-modal',
  header: 'mb-ov-overlay-head',
  title: 'mb-ov-title-wrap',
  body: 'mb-ov-body mb-overlay-frame',
  overlay: 'mb-ov-overlay',
  close: 'mb-ov-close',
}

export function Modal({
  opened,
  onClose,
  title,
  children,
  actions,
}: {
  opened: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** 唯一 Footer API：按钮放这里，固定底部、右对齐。 */
  actions?: ReactNode
}) {
  useEffect(() => {
    if (!opened) return
    return registerOverlay()
  }, [opened])

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
      <div className="mb-overlay-scroll">{children}</div>
      {actions ? <div className="mb-overlay-footer">{actions}</div> : null}
    </MantineModal>
  )
}
