import { prisma } from '../prisma.js'
import {
  balanceBefore,
  fromDate,
  fromMajor,
  toMajor,
  type LedgerTransaction,
  type OpeningBalance,
  type TransactionKind,
} from '../../../../packages/domain/src/index.js'
import { toLedgerTransaction } from './ledger.adapter.js'

/** 与领域层保持同一套交易类型。 */
export type TransactionType = TransactionKind

/**
 * 账户余额缓存。
 * get(accountId, date) 返回 date 当天开始前的余额，与数据库 `< date` 语义一致。
 */
export class BalanceCache {
  private cache: Map<string, Map<string, number>>

  constructor(cache: Map<string, Map<string, number>>) {
    this.cache = cache
  }

  private dateToKey(date: Date): string {
    return fromDate(date)
  }

  get(accountId: string, date: Date): number {
    const accountCache = this.cache.get(accountId)
    if (!accountCache) return 0
    return accountCache.get(this.dateToKey(date)) ?? 0
  }

  getMany(accountIds: string[], date: Date): number {
    const dateKey = this.dateToKey(date)
    return accountIds.reduce((sum, accountId) => {
      const accountCache = this.cache.get(accountId)
      if (!accountCache) return sum
      return sum + (accountCache.get(dateKey) ?? 0)
    }, 0)
  }

  getAccountCache(accountId: string): Map<string, number> | undefined {
    return this.cache.get(accountId)
  }
}

type AccountList = Awaited<ReturnType<typeof prisma.account.findMany>>

function openingOf(account: AccountList[number]): OpeningBalance {
  // 没有期初日期时，期初余额覆盖全部历史交易。
  if (!account.initialBalanceDate) {
    return { amount: fromMajor(account.initialBalance.toNumber()) }
  }
  return {
    date: fromDate(account.initialBalanceDate),
    amount: fromMajor(account.initialBalance.toNumber()),
  }
}

/**
 * 批量计算多个账户在多个日期的余额。
 * 期初余额是「期初日期当天开始前」的余额，当天交易照常计入。
 */
export async function calculateBalancesBatch(
  accountIds: string[],
  dates: Date[],
  accounts?: AccountList,
): Promise<BalanceCache> {
  if (accountIds.length === 0 || dates.length === 0) {
    return new BalanceCache(new Map())
  }

  const accountList = accounts ?? await prisma.account.findMany({
    where: { id: { in: accountIds } },
  })
  const accountMap = new Map(accountList.map((account) => [account.id, account]))

  const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime())
  const maxTargetDate = sortedDates[sortedDates.length - 1]!

  // 查询到最大查询日（不含）即可；没有下界，保证导入的历史交易不会被漏掉。
  const transactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { accountId: { in: accountIds } },
        { toAccountId: { in: accountIds } },
      ],
      date: { lt: maxTargetDate },
    },
    orderBy: { date: 'asc' },
  })

  const ledgers: LedgerTransaction[] = transactions.map(toLedgerTransaction)

  const result = new Map<string, Map<string, number>>()

  for (const accountId of accountIds) {
    const account = accountMap.get(accountId)
    const dateBalanceMap = new Map<string, number>()

    if (!account) {
      result.set(accountId, dateBalanceMap)
      continue
    }

    const opening = openingOf(account)
    const relevant = ledgers.filter(
      (transaction) => transaction.accountId === accountId || transaction.toAccountId === accountId,
    )

    for (const targetDate of sortedDates) {
      const dateKey = fromDate(targetDate)
      const balance = balanceBefore(accountId, opening, relevant, dateKey)
      dateBalanceMap.set(dateKey, toMajor(balance))
    }

    result.set(accountId, dateBalanceMap)
  }

  return new BalanceCache(result)
}

export async function getOrCreateAdjustmentCategory(type: 'income' | 'expense'): Promise<string> {
  const existing = await prisma.transactionCategory.findFirst({
    where: { name: '平账调整', type },
  })

  if (!existing) {
    const category = await prisma.transactionCategory.create({
      data: {
        name: '平账调整',
        type,
        icon: '⚙️',
      },
    })
    return category.id
  }

  return existing.id
}
