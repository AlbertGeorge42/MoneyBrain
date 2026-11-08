import { Modal } from '@mantine/core'
import { useEffect, useState } from 'react'
import { CategoryIcon } from '@/features/overview/category'
import type { LedgerCategory } from '@/features/overview/model'
import type { LedgerMutationOutcome } from '@/features/overview/ledgerStore'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
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
  const modalClass = {
    content: 'mb-tx-modal',
    header: 'mb-tx-sheet-head',
    title: 'mb-tx-sheet-title',
    body: 'mb-tx-sheet-body',
    overlay: 'mb-tx-overlay',
    close: 'mb-tx-sheet-close',
  }

  if (device === 'mobile') {
    return (
      <HfSheet variant="transaction" device={device} opened={opened} onClose={onClose} title={title}>
        {children}
      </HfSheet>
    )
  }

  return (
    <Modal opened={opened} onClose={onClose} centered size="auto" withinPortal={false} title={title} classNames={modalClass}>
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
  onPick: (categoryId: string) => Promise<LedgerMutationOutcome>
  onClose: () => void
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!opened) {
      setPending(null)
      setError('')
    }
  }, [opened])

  const pick = async (categoryId: string) => {
    if (pending) return
    setPending(categoryId)
    setError('')
    const result = await onPick(categoryId)
    setPending(null)
    if (!result.ok) setError(result.error ?? '批量改分类失败，请重试')
  }

  return (
    <Frame device={device} opened={opened} title="批量改分类" onClose={onClose}>
      <p className="mb-tx-dialog-note">将为已选 {count} 笔流水设置新分类；账户余额不变。</p>
      {error && (
        <p className="mb-tx-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="mb-tx-cat-list">
        {categories.map((category) => (
          <HfButton
            key={category.id}
            className="mb-tx-cat-option"
            disabled={Boolean(pending)}
            onClick={() => void pick(category.id)}
          >
            <CategoryIcon rootId={category.id} iconKey={category.iconKey} />
            <span>{category.name}</span>
          </HfButton>
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
  onConfirm: () => Promise<LedgerMutationOutcome>
  onClose: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!opened) {
      setPending(false)
      setError('')
    }
  }, [opened])

  const confirm = async () => {
    if (pending) return
    setPending(true)
    setError('')
    const result = await onConfirm()
    setPending(false)
    if (!result.ok) setError(result.error ?? '批量删除失败，请重试')
  }

  return (
    <Frame device={device} opened={opened} title="批量删除" onClose={onClose}>
      <p className="mb-tx-dialog-title">删除已选的 {count} 笔流水？</p>
      <p className="mb-tx-dialog-note">账户余额会一并回滚；删除后可用提示条撤销。</p>
      {error && (
        <p className="mb-tx-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="mb-tx-detail-actions">
        <HfButton className="mb-tx-btn is-danger-solid" onClick={() => void confirm()} disabled={pending}>
          {pending ? '删除中…' : `删除 ${count} 笔`}
        </HfButton>
        <HfButton className="mb-tx-btn is-ghost" onClick={onClose} disabled={pending}>
          取消
        </HfButton>
      </div>
    </Frame>
  )
}
