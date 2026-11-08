/**
 * 删除分类抽屉：有流水引用时，必须先选一个同类型分类承接这些流水。
 * 可转移目标 = 同类型且不在被删分类子树内的分类，一级分类排在前面。
 */
import { X } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import type { Ledger, TxType } from '@/features/overview/model'
import { categoryDescendantIds, type CategoryRow } from './model'

export function CategoryDeleteSheet({
  row,
  type,
  device,
  ledger,
  error,
  saving,
  onClose,
  onTransfer,
}: {
  row: CategoryRow
  type: TxType
  device: DeviceMode
  ledger: Ledger
  error: string | null
  saving: boolean
  onClose: () => void
  onTransfer: (targetId: string) => void
}) {
  const ids = new Set([row.id, ...categoryDescendantIds(ledger, row.id)])
  const options = ledger.categories
    .filter((category) => category.type === type && !ids.has(category.id))
    .sort((left, right) => Number(Boolean(left.parentId)) - Number(Boolean(right.parentId)))

  return (
    <HfSheet variant="settings" device={device} opened onClose={onClose} desktopSize={380}>
      <div className="mb-set-sheet-head">
        <h2 className="mb-set-sheet-title">删除「{row.name}」</h2>
        <HfButton className="mb-set-icon-btn" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </HfButton>
      </div>
      <div className="mb-set-sheet-body">
        <p className="mb-set-hint">
          共 {row.txCount} 笔交易引用这个分类（含子分类）。选择目标分类后，这些流水会整体转移，然后删除「{row.name}」。
        </p>
        <div className="mb-set-radio-list" role="radiogroup" aria-label="转移目标分类">
          {options.map((option) => (
            <HfButton
              key={option.id}
              role="radio"
              aria-checked={false}
              className="mb-set-radio"
              disabled={saving}
              onClick={() => onTransfer(option.id)}
            >
              <span className="mb-set-radio-dot" aria-hidden="true" />
              <span>{option.name}</span>
            </HfButton>
          ))}
        </div>
        {options.length === 0 && (
          <p className="mb-set-hint">没有可转移的同类型分类，请先新建一个分类。</p>
        )}
        {error && <p className="mb-tx-form-error" role="alert">{error}</p>}
      </div>
    </HfSheet>
  )
}
