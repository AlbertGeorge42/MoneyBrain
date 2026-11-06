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
} from '@/features/overview/model'
import { TxRow } from '@/features/shared/TxRow'
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

function DesktopTable({
  groups,
  totals,
  ledger,
  batchMode,
  display,
  selected,
  onToggle,
  onOpenDetail,
}: {
  groups: GroupedTransactions[]
  totals: TransactionTotals
  ledger: Ledger
  batchMode: boolean
  display: DisplaySettings
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
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
                  {group.date === 'future' && <span className="mb-tx-group-count">{group.items.length} 笔</span>}
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
  onToggle,
  onOpenDetail,
}: {
  groups: GroupedTransactions[]
  totals: TransactionTotals
  ledger: Ledger
  batchMode: boolean
  display: DisplaySettings
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
}) {
  return (
    <section className="mb-tx-m-list" aria-label="流水列表">
      {groups.map((group) => (
        <div key={group.date} className="mb-tx-m-group">
          <div className="mb-tx-m-group-head">
            <span className="mb-tx-group-label">
              {group.label}
              {group.date === 'future' && <span className="mb-tx-group-count">{group.items.length} 笔</span>}
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
                <button
                  key={transaction.id}
                  type="button"
                  role={batchMode ? 'checkbox' : undefined}
                  aria-checked={batchMode ? isSelected : undefined}
                  className={`mb-tx-m-row${isSelected ? ' is-selected' : ''}`}
                  onClick={() => (batchMode ? onToggle(transaction.id) : onOpenDetail(transaction.id))}
                >
                  {batchMode && <CheckBox checked={isSelected} />}
                  <CategoryIcon rootId={rootId} size="md" />
                  <span className="mb-tx-m-main">
                    <span className="mb-tx-m-title">
                      {display.showNote ? transaction.note : categoryName}
                    </span>
                    <span className="mb-tx-m-meta">{meta}</span>
                  </span>
                  <span className={`mb-tx-m-amount is-${transactionTone(transaction)}`}>
                    {signedAmountText(transaction)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <p className="mb-tx-m-foot">
        共 {totals.count} 笔 · 支出 {signedMinorText(-totals.expense)} · 收入 {signedMinorText(totals.income)}
      </p>
    </section>
  )
}

export function TransactionsList({
  device,
  groups,
  ledger,
  batchMode,
  display,
  selected,
  onToggle,
  onOpenDetail,
}: {
  device: DeviceMode
  groups: GroupedTransactions[]
  ledger: Ledger
  batchMode: boolean
  display: DisplaySettings
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
}) {
  const { current: totals } = splitTotalsByToday(groups.flatMap((group) => group.items))

  if (device === 'mobile') {
    return (
      <MobileList
        groups={groups}
        totals={totals}
        ledger={ledger}
        batchMode={batchMode}
        display={display}
        selected={selected}
        onToggle={onToggle}
        onOpenDetail={onOpenDetail}
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
      onToggle={onToggle}
      onOpenDetail={onOpenDetail}
    />
  )
}
