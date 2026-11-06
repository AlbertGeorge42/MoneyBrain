/**
 * 退款关联标记（行内轻量元素）：
 * - 退款行：`关联 #原交易`，点开原交易详情；未关联时显示「未关联原交易」。
 * - 原交易行：`已全额退款` / `已退款 ¥X`，金额只作状态提示，不改变行高。
 */
import {
  getRefundSummary,
  getRelatedTransaction,
  transactionRefLabel,
  type Ledger,
  type LedgerTransaction,
} from '@/features/overview/model'
import { amountText } from '@/features/overview/format'

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
  const text = `关联 #${transactionRefLabel(ledger, related)}`
  if (!onOpenRelated) return <span className="mb-tx-refund-tag">{text}</span>
  return (
    <button
      type="button"
      className="mb-tx-refund-tag is-link"
      onClick={(event) => {
        event.stopPropagation()
        onOpenRelated(related)
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {text}
    </button>
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
    <span className={`mb-tx-refund-tag${summary.state === 'full' ? ' is-full' : ''}`}>
      {summary.state === 'full' ? '已全额退款' : `已退款 ${amountText(summary.refunded)}`}
    </span>
  )
}
