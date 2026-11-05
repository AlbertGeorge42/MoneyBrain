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
import type { DeviceMode } from '@/features/shared/types'
import type { DisplaySettings } from './displaySettings'
import {
  signedMinorText,
  summarizeTransactions,
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
  const columnCount = 2 + (display.showNote ? 1 : 0) + (display.showAccount ? 1 : 0) + (batchMode ? 1 : 0)

  return (
    <section className="mb-card mb-tx-list-card" aria-label="流水列表">
      <table className={`mb-tx-table${display.showNote ? ' has-note' : ''}${display.showAccount ? ' has-account' : ''}${batchMode ? ' has-check' : ''}`}>
        <colgroup>
          {batchMode && <col className="mb-tx-col-check" />}
          <col className="mb-tx-col-main" />
          {display.showNote && <col className="mb-tx-col-mid" />}
          {display.showAccount && <col className="mb-tx-col-account" />}
          <col className="mb-tx-col-num" />
        </colgroup>
        <thead>
          <tr>
            {batchMode && <th scope="col" className="mb-tx-th-check" aria-label="选择" />}
            <th scope="col">分类</th>
            {display.showNote && <th scope="col">备注</th>}
            {display.showAccount && <th scope="col">账户</th>}
            <th scope="col" className="mb-tx-th-num">金额</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <FragmentGroup
              key={group.date}
              group={group}
              ledger={ledger}
              batchMode={batchMode}
              display={display}
              columnCount={columnCount}
              selected={selected}
              onToggle={onToggle}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={columnCount}>
              <div className="mb-tx-foot">
                <span className="mb-tx-foot-count">共 {totals.count} 笔</span>
                <span className="mb-tx-foot-flow">
                  支出 <strong className="is-expense">{signedMinorText(-totals.expense)}</strong>
                  收入 <strong className="is-income">{signedMinorText(totals.income)}</strong>
                </span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

function FragmentGroup({
  group,
  ledger,
  batchMode,
  display,
  columnCount,
  selected,
  onToggle,
  onOpenDetail,
}: {
  group: GroupedTransactions
  ledger: Ledger
  batchMode: boolean
  display: DisplaySettings
  columnCount: number
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
}) {
  return (
    <>
      <tr className="mb-tx-group-row">
        <td colSpan={columnCount}>
          <span className="mb-tx-group-label">{group.label}</span>
          <span className={group.net >= 0 ? 'mb-tx-group-net is-income' : 'mb-tx-group-net is-expense'}>
            小计 {signedMinorText(group.net)}
          </span>
        </td>
      </tr>
      {group.items.map((transaction) => {
        const account = getAccount(ledger, transaction.accountId)
        const rootId = getCategoryRootId(ledger, transaction.categoryId)
        const isSelected = selected.has(transaction.id)
        const categoryName = getCategoryName(ledger, transaction.categoryId)
        const categoryNode = (
          <span className="mb-tx-category">
            <CategoryIcon rootId={rootId} size="row" />
            <span className="mb-tx-ellipsis" title={categoryName}>
              {categoryName}
            </span>
          </span>
        )
        return (
          <tr
            key={transaction.id}
            className={`mb-tx-row${batchMode ? ' is-batch' : ''}${isSelected ? ' is-selected' : ''}`}
            onClick={() => (batchMode ? onToggle(transaction.id) : onOpenDetail(transaction.id))}
          >
            {batchMode && (
              <td className="mb-tx-td-check">
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
              </td>
            )}
            <td>
              {batchMode ? (
                categoryNode
              ) : (
                <button
                  type="button"
                  className="mb-tx-row-trigger"
                  aria-label={`查看 ${transaction.note} 详情`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenDetail(transaction.id)
                  }}
                >
                  {categoryNode}
                </button>
              )}
            </td>
            {display.showNote && (
              <td>
                <span className="mb-tx-ellipsis mb-tx-note" title={transaction.note}>
                  {transaction.note}
                </span>
              </td>
            )}
            {display.showAccount && (
              <td>
                <div className="mb-tx-account-line">
                  <span className="mb-tx-ellipsis mb-tx-account" title={account?.name}>
                    {account?.name ?? '未知账户'}
                  </span>
                  <span className="mb-tx-kind-tag">· {transactionDirection(transaction)}</span>
                </div>
              </td>
            )}
            <td className={`mb-tx-amount is-${transactionTone(transaction)}`}>
              {signedAmountText(transaction)}
            </td>
          </tr>
        )
      })}
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
            <span className="mb-tx-group-label">{group.label}</span>
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
  const totals = summarizeTransactions(groups.flatMap((group) => group.items))

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
