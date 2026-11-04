import { Checkbox, Tooltip, UnstyledButton } from '@mantine/core'
import { CategoryGlyph } from '../../ui/CategoryGlyph'
import {
  TYPE_LABELS,
  accountName,
  formatAmount,
  groupTransactionsByDay,
  txTone,
  txTitle,
} from './transaction-utils'
import type { Account, Category, DeviceMode, Transaction } from './types'

type TransactionListProps = {
  device: DeviceMode
  items: Transaction[]
  accounts: Account[]
  categories: Category[]
  batchMode: boolean
  selectedIds: Set<string>
  today: string
  onToggleSelect: (id: string) => void
  onOpen: (id: string) => void
}

function accountText(tx: Transaction, accounts: Account[]): string {
  const from = accountName(accounts.find((account) => account.id === tx.accountId), tx.accountId)
  if (tx.type === 'transfer' && tx.toAccountId) {
    const to = accountName(accounts.find((account) => account.id === tx.toAccountId), tx.toAccountId)
    return `${from} → ${to}`
  }
  return from
}

function subtotalTone(value: number): 'income' | 'expense' | 'neutral' {
  if (value > 0) return 'income'
  if (value < 0) return 'expense'
  return 'neutral'
}

/** 截断单元格：悬停 / 键盘聚焦显示全文；不改变行高，不做行内展开。 */
function Truncated({ text, className }: { text: string; className: string }) {
  return (
    <Tooltip label={text} openDelay={300} withinPortal position="top">
      <span className={className} tabIndex={0} aria-label={text}>{text}</span>
    </Tooltip>
  )
}

export function TransactionList({
  device,
  items,
  accounts,
  categories,
  batchMode,
  selectedIds,
  today,
  onToggleSelect,
  onOpen,
}: TransactionListProps) {
  const groups = groupTransactionsByDay(items, today)

  if (device === 'mobile') {
    return (
      <div className="tx-mobile-list">
        {groups.map((group) => (
          <section key={group.date} className="tx-mobile-day-group" aria-label={group.label}>
            <div className="tx-mobile-day">
              <span className="mb-text-0">{group.label}</span>
              <span className="mb-num mb-text-1" data-tone={subtotalTone(group.subtotal)}>
                {formatAmount(group.subtotal)}
              </span>
            </div>
            <div className="tx-mobile-cards">
              {group.items.map((tx) => {
                const category = categories.find((item) => item.id === tx.categoryId)
                const selected = selectedIds.has(tx.id)
                return (
                  <div key={tx.id} className="tx-mobile-row" data-selected={selected}>
                    {batchMode && (
                      <Checkbox
                        className="tx-row-check"
                        checked={selected}
                        aria-label={`选择 ${tx.subcategory}`}
                        onChange={() => onToggleSelect(tx.id)}
                      />
                    )}
                    <UnstyledButton
                      className="tx-mobile-card"
                      onClick={() => (batchMode ? onToggleSelect(tx.id) : onOpen(tx.id))}
                    >
                      {category && <CategoryGlyph icon={category.icon} colorIndex={category.colorIndex} />}
                      <span className="tx-mobile-main">
                        <span className="tx-mobile-title">{txTitle(tx, category)}</span>
                        <span className="mb-text-0">{accountText(tx, accounts)} · {TYPE_LABELS[tx.type]}</span>
                      </span>
                      <span className="tx-amount mb-num" data-tone={txTone(tx)}>{formatAmount(tx.amount)}</span>
                    </UnstyledButton>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="tx-table-wrap">
      <table className="tx-table">
        <colgroup>
          <col className="tx-col-main" />
          <col className="tx-col-mid" />
          <col className="tx-col-num" />
        </colgroup>
        <tbody>
          {groups.map((group) => (
            <GroupRows
              key={group.date}
              group={group}
              accounts={accounts}
              categories={categories}
              batchMode={batchMode}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

type GroupRowsProps = {
  group: ReturnType<typeof groupTransactionsByDay>[number]
  accounts: Account[]
  categories: Category[]
  batchMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpen: (id: string) => void
}

function GroupRows({ group, accounts, categories, batchMode, selectedIds, onToggleSelect, onOpen }: GroupRowsProps) {
  return (
    <>
      <tr className="tx-day-row">
        <th colSpan={3}>
          <div className="tx-day-head">
            <span>{group.label}</span>
            <span className="mb-num" data-tone={subtotalTone(group.subtotal)}>{formatAmount(group.subtotal)}</span>
          </div>
        </th>
      </tr>
      {group.items.map((tx) => {
        const category = categories.find((item) => item.id === tx.categoryId)
        const selected = selectedIds.has(tx.id)
        return (
          <tr
            key={tx.id}
            className="tx-row"
            data-selected={selected}
            tabIndex={0}
            aria-label={`${txTitle(tx, category)}，${accountText(tx, accounts)}，${formatAmount(tx.amount)}`}
            onClick={() => (batchMode ? onToggleSelect(tx.id) : onOpen(tx.id))}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              if (batchMode) onToggleSelect(tx.id)
              else onOpen(tx.id)
            }}
          >
            <td>
              <div className="tx-main-cell">
                {batchMode && (
                  <Checkbox
                    className="tx-row-check"
                    checked={selected}
                    aria-label={`选择 ${tx.subcategory}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggleSelect(tx.id)}
                  />
                )}
                {category && <CategoryGlyph icon={category.icon} colorIndex={category.colorIndex} />}
                <div className="tx-main-text">
                  <Truncated className="tx-title" text={txTitle(tx, category)} />
                  {tx.note && <Truncated className="tx-subtitle" text={tx.note} />}
                </div>
              </div>
            </td>
            <td>
              <Truncated className="tx-account" text={accountText(tx, accounts)} />
              <div className="mb-text-0">{TYPE_LABELS[tx.type]}</div>
            </td>
            <td className="tx-num-cell">
              <span className="tx-amount mb-num" data-tone={txTone(tx)}>{formatAmount(tx.amount)}</span>
            </td>
          </tr>
        )
      })}
    </>
  )
}
