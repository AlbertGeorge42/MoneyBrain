import { Drawer, Modal } from '@mantine/core'
import { CategoryIcon } from '@/features/overview/category'
import type { LedgerCategory } from '@/features/overview/model'
import type { DeviceMode } from '@/features/shared/types'
import type { ReactNode } from 'react'

function Frame({
  device,
  opened,
  title,
  onClose,
  children,
}: {
  device: DeviceMode
  opened: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const classNames = {
    content: device === 'mobile' ? 'mb-tx-sheet' : 'mb-tx-modal',
    header: 'mb-tx-sheet-head',
    title: 'mb-tx-sheet-title',
    body: 'mb-tx-sheet-body',
    overlay: 'mb-tx-overlay',
    close: 'mb-tx-sheet-close',
  }

  if (device === 'mobile') {
    return (
      <Drawer opened={opened} onClose={onClose} position="bottom" size="auto" withinPortal={false} title={title} classNames={classNames}>
        {children}
      </Drawer>
    )
  }

  return (
    <Modal opened={opened} onClose={onClose} centered size="auto" withinPortal={false} title={title} classNames={classNames}>
      {children}
    </Modal>
  )
}

export function BatchCategoryDialog({
  opened,
  device,
  count,
  categories,
  onPick,
  onClose,
}: {
  opened: boolean
  device: DeviceMode
  count: number
  categories: LedgerCategory[]
  onPick: (categoryId: string) => void
  onClose: () => void
}) {
  return (
    <Frame device={device} opened={opened} title="批量改分类" onClose={onClose}>
      <p className="mb-tx-dialog-note">将为已选 {count} 笔流水设置新分类；账户余额不变。</p>
      <div className="mb-tx-cat-list">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className="mb-tx-cat-option"
            onClick={() => onPick(category.id)}
          >
            <CategoryIcon rootId={category.id} />
            <span>{category.name}</span>
          </button>
        ))}
      </div>
    </Frame>
  )
}

export function BatchDeleteDialog({
  opened,
  device,
  count,
  onConfirm,
  onClose,
}: {
  opened: boolean
  device: DeviceMode
  count: number
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Frame device={device} opened={opened} title="批量删除" onClose={onClose}>
      <p className="mb-tx-dialog-title">删除已选的 {count} 笔流水？</p>
      <p className="mb-tx-dialog-note">账户余额会一并回滚；删除后可用提示条撤销。</p>
      <div className="mb-tx-detail-actions">
        <button type="button" className="mb-tx-btn is-danger-solid" onClick={onConfirm}>
          删除 {count} 笔
        </button>
        <button type="button" className="mb-tx-btn is-ghost" onClick={onClose}>
          取消
        </button>
      </div>
    </Frame>
  )
}
