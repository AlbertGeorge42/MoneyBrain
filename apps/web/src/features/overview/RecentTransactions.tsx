import { Fragment, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Tooltip } from '@mantine/core'
import { ArrowRight } from 'lucide-react'
import { CategoryIcon } from './category'
import { signedAmountText } from './format'
import {
  getAccount,
  getCategoryName,
  getCategoryRootId,
  transactionTone,
  type Ledger,
  type LedgerTransaction,
  type RecentGroup,
} from './model'
import type { DeviceMode } from '@/features/shared/types'

function EllipsisText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = useState(false)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => setTruncated(node.scrollWidth > node.clientWidth + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [text])

  const content = (
    <span ref={ref} className="mb-ellipsis" tabIndex={truncated ? 0 : undefined}>
      {text}
    </span>
  )

  return truncated ? (
    <Tooltip label={text} withArrow multiline maw="calc(var(--mb-s-7) * 6)">
      {content}
    </Tooltip>
  ) : (
    content
  )
}

function rowKeyboardHandler(
  event: KeyboardEvent<HTMLTableRowElement>,
  transaction: LedgerTransaction,
  onOpenDetail: (transaction: LedgerTransaction) => void,
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpenDetail(transaction)
  }
}

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
            {count === 0 ? '还没有流水' : `最新 ${count} 笔${mobile ? ' · 点按查看详情' : ' · 点击行查看详情'}`}
          </p>
        </div>
      </div>

      {count === 0 ? (
        <p className="mb-empty-inline">还没有流水，记下第一笔后这里会自动归档。</p>
      ) : mobile ? (
        <div className="mb-m-tx-list">
          {groups.map((group) => (
            <div key={group.date} className="mb-m-day">
              <div className="mb-m-day-label">{group.label}</div>
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
                        {getCategoryName(ledger, transaction.categoryId)} · {account?.name ?? '未知账户'}
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
        <div className="mb-table-scroll">
          <table className="mb-recent-table">
            <caption className="mb-visually-hidden">最近交易</caption>
            <colgroup>
              <col className="mb-col-main" />
              <col className="mb-col-mid" />
              <col className="mb-col-account" />
              <col className="mb-col-num" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">分类</th>
                <th scope="col">备注</th>
                <th scope="col">账户</th>
                <th scope="col" className="is-num">
                  金额
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.date}>
                  <tr className="mb-day-row">
                    <td colSpan={4}>{group.label}</td>
                  </tr>
                  {group.items.map((transaction) => {
                    const rootId = getCategoryRootId(ledger, transaction.categoryId)
                    const tone = transactionTone(transaction)
                    const account = getAccount(ledger, transaction.accountId)
                    return (
                      <tr
                        key={transaction.id}
                        className="mb-tx-table-row"
                        tabIndex={0}
                        aria-label={`查看交易详情：${transaction.note}`}
                        onClick={() => onOpenDetail(transaction)}
                        onKeyDown={(event) => rowKeyboardHandler(event, transaction, onOpenDetail)}
                      >
                        <td>
                          <span className="mb-cat-cell">
                            <CategoryIcon rootId={rootId} />
                            <EllipsisText text={getCategoryName(ledger, transaction.categoryId)} />
                          </span>
                        </td>
                        <td>
                          <EllipsisText text={transaction.note} />
                        </td>
                        <td>
                          <EllipsisText text={account?.name ?? '未知账户'} />
                        </td>
                        <td className="is-num">
                          <span className={`mb-amount is-${tone}`}>{signedAmountText(transaction)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" className="mb-link-btn mb-card-foot" onClick={onOpenAll}>
        查看全部流水
        <ArrowRight size={14} />
      </button>
    </section>
  )
}
