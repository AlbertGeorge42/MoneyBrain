import { Fragment } from 'react'
import { ArrowRight } from 'lucide-react'
import { TxRow } from '@/features/shared/TxRow'
import { CategoryIcon } from './category'
import { signedAmountText } from './format'
import {
  getAccount,
  getCategoryName,
  getCategoryRootId,
  transactionDirection,
  transactionTone,
  type Ledger,
  type LedgerTransaction,
  type RecentGroup,
} from './model'
import type { DeviceMode } from '@/features/shared/types'

export function RecentTransactions({
  device,
  groups,
  ledger,
  onOpenDetail,
  onOpenAll,
}: {
  device: DeviceMode
  groups: RecentGroup[]
  ledger: Ledger
  onOpenDetail: (transaction: LedgerTransaction) => void
  onOpenAll: () => void
}) {
  const count = groups.reduce((total, group) => total + group.items.length, 0)
  const mobile = device === 'mobile'

  return (
    <section className="mb-card mb-recent-card">
      <div className="mb-sec-head">
        <div>
          <h2 className="mb-sec-title">最近交易</h2>
          <p className="mb-sec-desc">
            {count === 0 ? '还没有流水' : `最新 ${count} 笔`}
          </p>
        </div>
      </div>

      {count === 0 ? (
        <p className="mb-empty-inline">还没有流水，记下第一笔后这里会自动归档。</p>
      ) : mobile ? (
        <div className="mb-m-tx-list">
          {groups.map((group) => (
            <div key={group.date} className="mb-m-day">
              <div className="mb-m-day-label">
                <span>{group.label}</span>
              </div>
              {group.items.map((transaction) => {
                const rootId = getCategoryRootId(ledger, transaction.categoryId)
                const tone = transactionTone(transaction)
                const account = getAccount(ledger, transaction.accountId)
                return (
                  <button
                    key={transaction.id}
                    type="button"
                    className="mb-m-tx"
                    onClick={() => onOpenDetail(transaction)}
                  >
                    <CategoryIcon rootId={rootId} size="md" />
                    <span className="mb-m-tx-main">
                      <span className="mb-m-tx-note">{transaction.note}</span>
                      <span className="mb-m-tx-meta">
                        {getCategoryName(ledger, transaction.categoryId)} · {account?.name ?? '未知账户'} ·{' '}
                        {transactionDirection(transaction)}
                      </span>
                    </span>
                    <span className={`mb-m-tx-amount is-${tone}`}>{signedAmountText(transaction)}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-tx-rows">
          {groups.map((group) => (
            <Fragment key={group.date}>
              <div className="mb-tx-group-row">
                <span className="mb-tx-group-label">{group.label}</span>
              </div>
              {group.items.map((transaction) => (
                <TxRow
                  key={transaction.id}
                  ledger={ledger}
                  transaction={transaction}
                  ariaLabel={`查看交易详情：${transaction.note}`}
                  onActivate={() => onOpenDetail(transaction)}
                />
              ))}
            </Fragment>
          ))}
        </div>
      )}

      <button type="button" className="mb-link-btn mb-card-foot" onClick={onOpenAll}>
        查看全部流水
        <ArrowRight size={14} />
      </button>
    </section>
  )
}
