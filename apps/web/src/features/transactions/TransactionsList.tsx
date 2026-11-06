import { Fragment } from 'react'
import { Check } from 'lucide-react'
import { CategoryIcon } from '@/features/overview/category'
import { signedAmountText } from '@/features/overview/format'
import {
  getAccount,
  getCategoryName,
  getCategoryRootId,
  transactionDirection,
  transactionTone,
  type Ledger,
  type LedgerTransaction,
} from '@/features/overview/model'
import { TxRow } from '@/features/shared/TxRow'
import { RefundRelationTag, RefundStateTag } from '@/features/shared/RefundTag'
import type { DeviceMode } from '@/features/shared/types'
import type { DisplaySettings } from './displaySettings'
import {
  signedMinorText,
  splitTotalsByToday,
  type GroupedTransactions,
  type TransactionTotals,
} from './filters'

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span className={checked ? 'mb-tx-checkbox is-checked' : 'mb-tx-checkbox'} aria-hidden="true">
      {checked && <Check size={12} strokeWidth={2.4} />}
    </span>
  )
}

function ExcludedToggle({
  includeExcluded,
  excludedCount,
  onToggle,
}: {
  includeExcluded: boolean
  excludedCount: number
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={includeExcluded ? 'mb-tx-excluded-toggle is-active' : 'mb-tx-excluded-toggle'}
      aria-pressed={includeExcluded}
      title="默认只统计计入收支的流水；切换后把标记为「不计收支」的交易也并入合计"
      onClick={onToggle}
    >
      {includeExcluded ? '包含不计收支' : '不含不计收支'}
      {excludedCount > 0 && <span className="mb-tx-excluded-count">{excludedCount}</span>}
    </button>
  )
}

function DesktopTable({
  groups,
  totals,
  ledger,
  batchMode,
  display,
  selected,
  includeExcluded,
  excludedCount,
  onToggleExcluded,
  onToggle,
  onOpenDetail,
  onOpenRelated,
}: {
  groups: GroupedTransactions[]
  totals: TransactionTotals
  ledger: Ledger
  batchMode: boolean
  display: DisplaySettings
  selected: ReadonlySet<string>
  includeExcluded: boolean
  excludedCount: number
  onToggleExcluded: () => void
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
  onOpenRelated?: (transaction: LedgerTransaction) => void
}) {
  return (
    <>
      <section className="mb-card mb-tx-list-card" aria-label="流水列表">
        <div className="mb-tx-rows">
          {groups.map((group) => (
            <Fragment key={group.date}>
              <div className="mb-tx-group-row">
                <span className="mb-tx-group-label">
                  {group.label}
                  {group.future && <span className="mb-tx-group-count">{group.items.length} 笔</span>}
                </span>
                <span className={group.net >= 0 ? 'mb-tx-group-net is-income' : 'mb-tx-group-net is-expense'}>
                  小计 {signedMinorText(group.net)}
                </span>
              </div>
              {group.items.map((transaction) => {
                const isSelected = selected.has(transaction.id)
                const activate = () =>
                  batchMode ? onToggle(transaction.id) : onOpenDetail(transaction.id)
                return (
                  <TxRow
                    key={transaction.id}
                    ledger={ledger}
                    transaction={transaction}
                    showNote={display.showNote}
                    showAccount={display.showAccount}
                    selected={isSelected}
                    ariaLabel={batchMode ? `选择 ${transaction.note}` : `查看 ${transaction.note} 详情`}
                    onActivate={activate}
                    onOpenRelated={onOpenRelated}
                    leading={
                      batchMode ? (
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={`选择 ${transaction.note}`}
                          className="mb-tx-check-btn"
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggle(transaction.id)
                          }}
                        >
                          <CheckBox checked={isSelected} />
                        </button>
                      ) : undefined
                    }
                  />
                )
              })}
            </Fragment>
          ))}
        </div>
      </section>
      {/* 合计条独立于列表卡片：卡片 overflow:hidden 会让 sticky 失效。 */}
      <div className="mb-tx-foot">
        <span className="mb-tx-foot-count">共 {totals.count} 笔</span>
        <ExcludedToggle
          includeExcluded={includeExcluded}
          excludedCount={excludedCount}
          onToggle={onToggleExcluded}
        />
        <span className="mb-tx-foot-flow">
          支出 <strong className="is-expense">{signedMinorText(-totals.expense)}</strong>
          收入 <strong className="is-income">{signedMinorText(totals.income)}</strong>
        </span>
      </div>
    </>
  )
}

function MobileList({
  groups,
  totals,
  ledger,
  batchMode,
  display,
  selected,
  includeExcluded,
  excludedCount,
  onToggleExcluded,
  onToggle,
  onOpenDetail,
  onOpenRelated,
}: {
  groups: GroupedTransactions[]
  totals: TransactionTotals
  ledger: Ledger
  batchMode: boolean
  display: DisplaySettings
  selected: ReadonlySet<string>
  includeExcluded: boolean
  excludedCount: number
  onToggleExcluded: () => void
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
  onOpenRelated?: (transaction: LedgerTransaction) => void
}) {
  return (
    <section className="mb-tx-m-list" aria-label="流水列表">
      {groups.map((group) => (
        <div key={group.date} className="mb-tx-m-group">
          <div className="mb-tx-m-group-head">
            <span className="mb-tx-group-label">
              {group.label}
              {group.future && <span className="mb-tx-group-count">{group.items.length} 笔</span>}
            </span>
            <span className={group.net >= 0 ? 'mb-tx-group-net is-income' : 'mb-tx-group-net is-expense'}>
              小计 {signedMinorText(group.net)}
            </span>
          </div>
          <div className="mb-card mb-tx-m-card">
            {group.items.map((transaction) => {
              const account = getAccount(ledger, transaction.accountId)
              const rootId = getCategoryRootId(ledger, transaction.categoryId)
              const isSelected = selected.has(transaction.id)
              const categoryName = getCategoryName(ledger, transaction.categoryId)
              const meta = [
                display.showAccount ? (account?.name ?? '未知账户') : null,
                transactionDirection(transaction),
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <div
                  key={transaction.id}
                  role={batchMode ? 'checkbox' : 'button'}
                  aria-checked={batchMode ? isSelected : undefined}
                  tabIndex={0}
                  className={`mb-tx-m-row${isSelected ? ' is-selected' : ''}`}
                  onClick={() => (batchMode ? onToggle(transaction.id) : onOpenDetail(transaction.id))}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    if (batchMode) onToggle(transaction.id)
                    else onOpenDetail(transaction.id)
                  }}
                >
                  {batchMode && <CheckBox checked={isSelected} />}
                  <CategoryIcon rootId={rootId} size="md" />
                  <span className="mb-tx-m-main">
                    <span className="mb-tx-m-title">
                      {display.showNote ? transaction.note : categoryName}
                    </span>
                    <span className="mb-tx-m-meta">
                      <span className="mb-tx-m-meta-text">{meta}</span>
                      {transaction.excludeFromIncomeExpense && (
                        <span className="mb-tx-excluded">不计收支</span>
                      )}
                      {!batchMode && (
                        <>
                          <RefundRelationTag ledger={ledger} transaction={transaction} onOpenRelated={onOpenRelated} />
                          <RefundStateTag ledger={ledger} transaction={transaction} />
                        </>
                      )}
                    </span>
                  </span>
                  <span className={`mb-tx-m-amount is-${transactionTone(transaction)}`}>
                    {signedAmountText(transaction)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div className="mb-tx-m-foot">
        <span>
          共 {totals.count} 笔 · 支出 {signedMinorText(-totals.expense)} · 收入 {signedMinorText(totals.income)}
        </span>
        <ExcludedToggle
          includeExcluded={includeExcluded}
          excludedCount={excludedCount}
          onToggle={onToggleExcluded}
        />
      </div>
    </section>
  )
}

export function TransactionsList({
  device,
  groups,
  ledger,
  today,
  batchMode,
  display,
  selected,
  includeExcluded,
  excludedCount,
  onToggleExcluded,
  onToggle,
  onOpenDetail,
  onOpenRelated,
}: {
  device: DeviceMode
  groups: GroupedTransactions[]
  ledger: Ledger
  /** 「本月」口径的今天；API 模式来自真实账本，种子版是固定 TODAY。 */
  today: string
  batchMode: boolean
  display: DisplaySettings
  selected: ReadonlySet<string>
  includeExcluded: boolean
  excludedCount: number
  onToggleExcluded: () => void
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
  onOpenRelated?: (transaction: LedgerTransaction) => void
}) {
  const { current: totals } = splitTotalsByToday(groups.flatMap((group) => group.items), today, {
    includeExcluded,
  })

  if (device === 'mobile') {
    return (
      <MobileList
        groups={groups}
        totals={totals}
        ledger={ledger}
        batchMode={batchMode}
        display={display}
        selected={selected}
        includeExcluded={includeExcluded}
        excludedCount={excludedCount}
        onToggleExcluded={onToggleExcluded}
        onToggle={onToggle}
        onOpenDetail={onOpenDetail}
        onOpenRelated={onOpenRelated}
      />
    )
  }

  return (
    <DesktopTable
      groups={groups}
      totals={totals}
      ledger={ledger}
      batchMode={batchMode}
      display={display}
      selected={selected}
      includeExcluded={includeExcluded}
      excludedCount={excludedCount}
      onToggleExcluded={onToggleExcluded}
      onToggle={onToggle}
      onOpenDetail={onOpenDetail}
      onOpenRelated={onOpenRelated}
    />
  )
}
