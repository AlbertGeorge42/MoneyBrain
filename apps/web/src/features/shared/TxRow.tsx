/**
 * 流水行（两段式）：总览「最近交易」与流水页共用，避免同一语义在两个页面分叉。
 *
 * 主行：分类图标 + 分类名 primary/600 · 备注 primary/600
 * 副行：账户 · 类型 tertiary/12px
 * 行高、图标、内边距与 1px dashed 分隔线全部由 `--mb-tx-*` 控制。
 */
import type { ReactNode } from 'react'
import { CategoryIcon } from '@/features/overview/category'
import { signedAmountText } from '@/features/overview/format'
import { RefundRelationTag, RefundStateTag } from './RefundTag'
import {
  getAccount,
  getCategoryIconKey,
  getCategoryName,
  getCategoryRootId,
  transactionDirection,
  transactionTone,
  type Ledger,
  type LedgerTransaction,
} from '@/features/overview/model'
import './txRow.css'

export function TxRow({
  ledger,
  transaction,
  showNote = true,
  showAccount = true,
  selected = false,
  leading,
  ariaLabel,
  onActivate,
  onOpenRelated,
}: {
  ledger: Ledger
  transaction: LedgerTransaction
  showNote?: boolean
  showAccount?: boolean
  selected?: boolean
  leading?: ReactNode
  ariaLabel?: string
  onActivate: () => void
  /** 点行内「关联 #原交易」时打开对方详情（不触发本行详情）。 */
  onOpenRelated?: (transaction: LedgerTransaction) => void
}) {
  const account = getAccount(ledger, transaction.accountId)
  const rootId = getCategoryRootId(ledger, transaction.categoryId)
  const iconKey = getCategoryIconKey(ledger, transaction.categoryId)
  const categoryName = getCategoryName(ledger, transaction.categoryId)
  const toAccount =
    transaction.type === 'transfer' && transaction.toAccountId
      ? getAccount(ledger, transaction.toAccountId)
      : undefined

  return (
    <div
      role="button"
      tabIndex={0}
      className={`mb-tx-row${selected ? ' is-selected' : ''}`}
      aria-label={ariaLabel}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onActivate()
      }}
    >
      {leading}
      <CategoryIcon rootId={rootId} iconKey={iconKey} />
      <span className="mb-tx-main">
        <span className="mb-tx-primary">
          <span className="mb-tx-cat-name">{categoryName}</span>
          {showNote && transaction.note && (
            <>
              <span className="mb-tx-sep" aria-hidden="true">
                ·
              </span>
              <span className="mb-tx-note" title={transaction.note}>
                {transaction.note}
              </span>
            </>
          )}
        </span>
        <span className="mb-tx-secondary">
          {showAccount && (
            <>
              <span className="mb-tx-account" title={account?.name ?? '未知账户'}>
                {account?.name ?? '未知账户'}
              </span>
              <span className="mb-tx-sep" aria-hidden="true">
                ·
              </span>
            </>
          )}
          <span className="mb-tx-kind">{transactionDirection(transaction)}</span>
          {transaction.excludeFromIncomeExpense && (
            <span className="mb-tx-excluded">不计收支</span>
          )}
          <RefundRelationTag ledger={ledger} transaction={transaction} onOpenRelated={onOpenRelated} />
          <RefundStateTag ledger={ledger} transaction={transaction} />
        </span>
      </span>
      <span className="mb-tx-amount-col">
        <span className={`mb-tx-amount is-${transactionTone(transaction)}`}>
          {signedAmountText(transaction)}
        </span>
        {toAccount?.name && <span className="mb-tx-amount-alt">→ {toAccount.name}</span>}
      </span>
    </div>
  )
}
