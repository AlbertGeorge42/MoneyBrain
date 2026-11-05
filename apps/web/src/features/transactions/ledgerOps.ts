/**
 * 账本变更（HF 流水页）
 *
 * 只做「记录 → 账户余额」的可逆调整，保证编辑 / 删除 / 批量操作后
 * 总览净值与账户卡同步。所有函数返回新账本，不修改入参。
 */
import type { Ledger, LedgerTransaction } from '@/features/overview/model'

export interface TransactionPatch {
  categoryId: string
  accountId: string
  date: string
  note: string
  amount: number
}

interface BalanceDelta {
  accountId: string
  amount: number
}

function balanceDeltas(transaction: LedgerTransaction): BalanceDelta[] {
  switch (transaction.type) {
    case 'expense':
      return [{ accountId: transaction.accountId, amount: -Math.abs(transaction.amount) }]
    case 'income':
    case 'refund':
      return [{ accountId: transaction.accountId, amount: Math.abs(transaction.amount) }]
    case 'adjustment':
      return [{ accountId: transaction.accountId, amount: transaction.amount }]
    case 'transfer': {
      if (!transaction.toAccountId) return []
      const amount = Math.abs(transaction.amount)
      const fee = transaction.fee ?? 0
      return [
        { accountId: transaction.accountId, amount: -amount - fee },
        { accountId: transaction.toAccountId, amount },
      ]
    }
  }
}

function adjustAccounts(
  ledger: Ledger,
  deltas: readonly BalanceDelta[],
  direction: 1 | -1,
): Ledger {
  if (deltas.length === 0) return ledger
  return {
    ...ledger,
    accounts: ledger.accounts.map((account) => {
      const delta = deltas.find((item) => item.accountId === account.id)
      return delta ? { ...account, balance: account.balance + delta.amount * direction } : account
    }),
  }
}

export function updateTransactionInLedger(
  ledger: Ledger,
  id: string,
  patch: TransactionPatch,
): Ledger {
  const current = ledger.transactions.find((transaction) => transaction.id === id)
  if (!current) return ledger

  const next: LedgerTransaction = {
    ...current,
    categoryId: patch.categoryId,
    accountId: patch.accountId,
    date: patch.date,
    note: patch.note.trim() || current.note,
    // 支出取正；收入 / 转账 / 退款 / 调整保留符号（调整的负数表示减记）
    amount:
      current.type === 'adjustment'
        ? Math.round(patch.amount)
        : Math.round(Math.abs(patch.amount)),
  }

  const reverted = adjustAccounts(ledger, balanceDeltas(current), -1)
  const applied = adjustAccounts(reverted, balanceDeltas(next), 1)

  return {
    ...applied,
    transactions: applied.transactions.map((transaction) => (transaction.id === id ? next : transaction)),
  }
}

export function deleteTransactionsFromLedger(ledger: Ledger, ids: readonly string[]): Ledger {
  const removing = new Set(ids)
  if (removing.size === 0) return ledger

  let next = ledger
  for (const transaction of ledger.transactions) {
    if (!removing.has(transaction.id)) continue
    next = adjustAccounts(next, balanceDeltas(transaction), -1)
  }

  return {
    ...next,
    transactions: next.transactions.filter((transaction) => !removing.has(transaction.id)),
  }
}

export function setTransactionsCategory(ledger: Ledger, ids: readonly string[], categoryId: string): Ledger {
  const changing = new Set(ids)
  if (changing.size === 0) return ledger
  return {
    ...ledger,
    transactions: ledger.transactions.map((transaction) =>
      changing.has(transaction.id) ? { ...transaction, categoryId } : transaction,
    ),
  }
}

/**
 * 撤销用：只恢复被本次操作影响的记录。
 * 若记录仍在账本中，先反向当前余额影响再应用旧记录；已删除的记录追加回账本。
 */
export function restoreTransactionsInLedger(
  ledger: Ledger,
  records: readonly LedgerTransaction[],
): Ledger {
  if (records.length === 0) return ledger
  const restoring = new Map(records.map((record) => [record.id, record]))

  let next = ledger
  for (const record of records) {
    const current = next.transactions.find((transaction) => transaction.id === record.id)
    if (current) next = adjustAccounts(next, balanceDeltas(current), -1)
    next = adjustAccounts(next, balanceDeltas(record), 1)
  }

  const existing = next.transactions.map((transaction) => restoring.get(transaction.id) ?? transaction)
  const present = new Set(existing.map((transaction) => transaction.id))
  const missing = records.filter((record) => !present.has(record.id))

  return { ...next, transactions: [...existing, ...missing] }
}

export function restoreTransactionCategoriesInLedger(
  ledger: Ledger,
  entries: readonly { id: string; categoryId: string }[],
): Ledger {
  if (entries.length === 0) return ledger
  const restoring = new Map(entries.map((entry) => [entry.id, entry.categoryId]))
  return {
    ...ledger,
    transactions: ledger.transactions.map((transaction) => {
      const categoryId = restoring.get(transaction.id)
      return categoryId ? { ...transaction, categoryId } : transaction
    }),
  }
}
