import { Tag, Trash2, X } from 'lucide-react'
import type { DeviceMode } from '@/features/shared/types'

export function BatchBar({
  device,
  count,
  categoryDisabled = false,
  categoryHint,
  onCategory,
  onDelete,
  onExit,
}: {
  device: DeviceMode
  count: number
  categoryDisabled?: boolean
  categoryHint?: string
  onCategory: () => void
  onDelete: () => void
  onExit: () => void
}) {
  return (
    <div className={device === 'mobile' ? 'mb-tx-batchbar is-mobile' : 'mb-tx-batchbar'} role="region" aria-label="批量操作">
      <span className="mb-tx-batch-count">已选 {count} 笔</span>
      {categoryHint && <span className="mb-tx-batch-hint">{categoryHint}</span>}
      <div className="mb-tx-batch-actions">
        <button
          type="button"
          className="mb-tx-btn"
          disabled={count === 0 || categoryDisabled}
          title={categoryDisabled ? categoryHint : undefined}
          onClick={onCategory}
        >
          <Tag size={15} />
          改分类
        </button>
        <button type="button" className="mb-tx-btn is-danger" disabled={count === 0} onClick={onDelete}>
          <Trash2 size={15} />
          删除
        </button>
        <button type="button" className="mb-tx-btn is-ghost" onClick={onExit}>
          <X size={15} />
          退出
        </button>
      </div>
    </div>
  )
}
