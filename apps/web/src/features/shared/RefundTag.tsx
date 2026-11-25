/**
 * 退款关联标记（行内轻量元素）：
 * - 退款行：`原交易`，点开原交易详情；未关联时显示「未关联原交易」。
 *   退款继承原交易分类，主行已是「分类 · 备注」，副行不再重复原交易名称。
 * - 原交易行：`已全额退款` / `已退款 ¥X`，金额只作状态提示，不改变行高。
 */
import {
  getRefundSummary,
  getRelatedTransaction,
  type Ledger,
  type LedgerTransaction,
} from '@/features/overview/model'
import { amountText } from '@/features/overview/format'
import { TxLink } from '@/features/shared/TxLink'

export function RefundRelationTag({
  ledger,
  transaction,
  onOpenRelated,
}: {
  ledger: Ledger
  transaction: LedgerTransaction
  onOpenRelated?: (transaction: LedgerTransaction) => void
}) {
  if (transaction.type !== 'refund') return null
  const related = getRelatedTransaction(ledger, transaction)
  if (!related) {
    return <span className="mb-tx-refund-tag is-unlinked">未关联原交易</span>
  }
  // 退款继承原交易分类，主行已是「分类 · 备注」，副行只留「原交易」入口，不重复名称。
  if (!onOpenRelated) return <span className="mb-tx-refund-tag">原交易</span>
  return (
    <TxLink
      className="mb-tx-refund-tag mb-tx-refund-tag--link"
      onClick={(event) => {
        event.stopPropagation()
        onOpenRelated(related)
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      原交易
    </TxLink>
  )
}

export function RefundStateTag({
  ledger,
  transaction,
}: {
  ledger: Ledger
  transaction: LedgerTransaction
}) {
  if (transaction.type !== 'expense' && transaction.type !== 'income') return null
  const summary = getRefundSummary(ledger, transaction)
  if (summary.state === 'none') return null
  return (
    <span className={`mb-tx-refund-tag${summary.state === 'full' ? '--full' : ''}`}>
      {summary.state === 'full' ? '已全额退款' : `已退款 ${amountText(summary.refunded)}`}
    </span>
  )
}
