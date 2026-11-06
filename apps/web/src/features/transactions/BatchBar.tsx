import { Tag, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { DeviceMode } from '@/features/shared/types'

/** 类别名与类型名重复时只留一次：退款（退款）→ 退款，账户互转（转账）→ 账户互转。 */
function describeExcluded(item: { label: string; reason: string }): string {
  const redundant = item.label === item.reason || (item.reason === '转账' && item.label.includes('转'))
  return redundant ? item.label : `${item.label}（${item.reason}）`
}

/** 摘要固定一行：最多展开两项，其余折叠成「+N」。 */
function summarizeExcluded(excluded: readonly { label: string; reason: string }[]): string {
  const shown = excluded.slice(0, 2).map(describeExcluded)
  const rest = excluded.length - shown.length
  return `已排除：${shown.join('、')}${rest > 0 ? ` +${rest}` : ''}`
}

export function BatchBar({
  device,
  count,
  excluded = [],
  categoryDisabled = false,
  categoryHint,
  onCategory,
  onDelete,
  onSelectExpenseOnly,
  onExit,
}: {
  device: DeviceMode
  count: number
  /** 混选时被挡在「改分类」之外的具体记录：指出是哪几笔、为什么。 */
  excluded?: readonly { id: string; label: string; reason: string }[]
  categoryDisabled?: boolean
  categoryHint?: string
  onCategory: () => void
  onDelete: () => void
  onSelectExpenseOnly: () => void
  onExit: () => void
}) {
  const summary = excluded.length > 0 ? summarizeExcluded(excluded) : categoryHint
  const summaryTitle =
    excluded.length > 0
      ? `已排除：${excluded.map(describeExcluded).join('、')}`
      : categoryHint

  const bar = (
    <div className={device === 'mobile' ? 'mb-tx-batchbar is-mobile' : 'mb-tx-batchbar'} role="region" aria-label="批量操作">
      <span className="mb-tx-batch-count" title={summaryTitle}>
        已选 {count} 笔
      </span>
      {summary && (
        <span className="mb-tx-batch-summary" title={summaryTitle}>
          {summary}
        </span>
      )}
      <div className="mb-tx-batch-actions">
        {excluded.length > 0 && (
          <button type="button" className="mb-tx-btn is-ghost mb-tx-batch-select-expense" onClick={onSelectExpenseOnly}>
            仅选支出
          </button>
        )}
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

  if (device === 'mobile' && typeof document !== 'undefined') {
    const dock = document.querySelector('.mb-mobile-dock')
    if (dock) return createPortal(bar, dock)
  }
  return bar
}
