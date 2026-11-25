import { amountText } from '@/features/overview/format'
import {
  formatDateLabel,
  getRefundList,
  getRefundSummary,
  type Ledger,
  type LedgerTransaction,
} from '@/features/overview/model'
import { TxLink } from './TxLink'
import './refund.css'

/**
 * 原交易的退款摘要（已退款 + 退款明细列表）。
 * overview 只读详情与 transactions 编辑面板共用同一实现，避免两处逐字重复。
 */
export function RefundSummarySection({
  ledger,
  transaction,
  onOpenTransaction,
}: {
  ledger: Ledger
  transaction: LedgerTransaction
  onOpenTransaction: (transaction: LedgerTransaction) => void
}) {
  const summary = getRefundSummary(ledger, transaction)
  const refunds = getRefundList(ledger, transaction)
  if (summary.state === 'none') return null

  return (
    <div>
      <dt>退款</dt>
      <dd>
        <span className="mb-shared-refund-summary">
          已退款 {amountText(summary.refunded)}
          {summary.state === 'full' && <span className="mb-shared-refund-badge mb-shared-refund-badge--full">已全额退款</span>}
        </span>
        {refunds.length > 0 && (
          <span className="mb-shared-refund-items">
            {refunds.map((refund) => (
              <TxLink
                key={refund.id}
                className="mb-shared-refund-item"
                onClick={() => onOpenTransaction(refund)}
              >
                <span>{formatDateLabel(refund.date)}</span>
                <span className="mb-shared-refund-item-note">{refund.note || '退款'}</span>
                <span className="mb-shared-refund-item-amount">{amountText(refund.amount)}</span>
              </TxLink>
            ))}
          </span>
        )}
      </dd>
    </div>
  )
}
