import { prisma } from '../index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import { ZERO } from '../common/index.js'

export type TransactionType = 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment'

export function calculateBalanceChangeDecimal(
  type: TransactionType,
  amount: Decimal,
  fee: Decimal = ZERO,
  coupon: Decimal = ZERO
): Decimal {
  switch (type) {
    case 'income':
      return amount
    case 'expense':
      return amount.negated()
    case 'transfer':
      if (coupon.greaterThan(ZERO)) {
        return amount.negated()
      } else if (fee.greaterThan(ZERO)) {
        return amount.plus(fee).negated()
      }
      return amount.negated()
    case 'refund':
      return amount.minus(fee)
    case 'adjustment':
      return amount
    default:
      return ZERO
  }
}

export function calculateTransferInAmountDecimal(
  amount: Decimal,
  _fee: Decimal = ZERO,
  coupon: Decimal = ZERO
): Decimal {
  if (coupon.greaterThan(ZERO)) {
    return amount.plus(coupon)
  }
  return amount
}

/**
 * 根据交易列表计算余额变动
 * @param transactions 从账户转出的交易列表
 * @param toTransactions 转入账户的交易列表
 * @param multiplier 1 为前向计算，-1 为后向计算
 */
function applyTransactionsToBalance(
  balance: Decimal,
  transactions: { type: string; amount: Decimal; fee: Decimal; coupon: Decimal }[],
  toTransactions: { type: string; amount: Decimal; fee: Decimal; coupon: Decimal }[],
  multiplier: 1 | -1 = 1
): Decimal {
  transactions.forEach(t => {
    const change = calculateBalanceChangeDecimal(t.type as TransactionType, t.amount, t.fee, t.coupon)
    balance = balance.plus(change.times(multiplier))
  })
  toTransactions.forEach(t => {
    if (t.type === 'transfer') {
      const inAmount = calculateTransferInAmountDecimal(t.amount, t.fee, t.coupon)
      balance = balance.plus(inAmount.times(multiplier))
    }
  })
  return balance
}

/**
 * 批量余额缓存类
 * 提供高效的余额查询接口
 */
export class BalanceCache {
  private cache: Map<string, Map<string, number>>

  constructor(cache: Map<string, Map<string, number>>) {
    this.cache = cache
  }

  private dateToKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
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

/**
 * 批量计算多个账户在多个日期的余额
 * 通过一次查询所有相关交易，大幅减少数据库访问次数
 * 
 * @param accountIds 要计算余额的账户ID列表
 * @param dates 要计算的日期列表
 * @returns BalanceCache 缓存对象，可通过 get() 方法快速查询
 */
export async function calculateBalancesBatch(
  accountIds: string[],
  dates: Date[]
): Promise<BalanceCache> {
  if (accountIds.length === 0 || dates.length === 0) {
    return new BalanceCache(new Map())
  }

  // 1. 一次性查询所有账户
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } }
  })
  const accountMap = new Map(accounts.map(a => [a.id, a]))

  // 2. 对日期排序并确定查询范围
  const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime())
  const minDate = sortedDates[0]
  const maxTargetDate = sortedDates[sortedDates.length - 1]
  // 需要查询到最大日期的下一天（因为计算使用 lt: targetDate）
  const maxDate = new Date(maxTargetDate.getTime() + 86400000)

  // 3. 一次性查询所有相关交易
  const transactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { accountId: { in: accountIds }, date: { gte: minDate, lt: maxDate } },
        { toAccountId: { in: accountIds }, date: { gte: minDate, lt: maxDate } }
      ]
    },
    orderBy: { date: 'asc' }
  })

  // 4. 为每个账户计算每个日期的余额
  const result = new Map<string, Map<string, number>>()

  for (const accountId of accountIds) {
    const account = accountMap.get(accountId)
    if (!account) {
      result.set(accountId, new Map())
      continue
    }

    // 筛选该账户相关的交易
    const accountFromTransactions = transactions.filter(t => t.accountId === accountId)
    const accountToTransactions = transactions.filter(t => t.toAccountId === accountId)

    const dateBalanceMap = new Map<string, number>()
    const initialBalance = account.initialBalance
    const initialDate = account.initialBalanceDate

    for (const targetDate of sortedDates) {
      const year = targetDate.getFullYear()
      const month = String(targetDate.getMonth() + 1).padStart(2, '0')
      const day = String(targetDate.getDate()).padStart(2, '0')
      const dateKey = `${year}-${month}-${day}`

      if (!initialDate) {
        // 无初始余额日期，计算所有早于目标日期的交易
        const relevantFrom = accountFromTransactions.filter(t => t.date < targetDate)
        const relevantTo = accountToTransactions.filter(t => t.date < targetDate)
        const balance = applyTransactionsToBalance(initialBalance, relevantFrom, relevantTo)
        dateBalanceMap.set(dateKey, balance.toNumber())
      } else {
        // 有初始余额日期，根据方向计算
        // 初始余额日期代表当天结束，所以初始日期的下一天是计算的起点
        const initialDateNextDay = new Date(initialDate)
        initialDateNextDay.setDate(initialDateNextDay.getDate() + 1)
        
        const isForward = targetDate >= initialDateNextDay
        
        let dateRange: { gte: Date; lt: Date }
        let multiplier: 1 | -1
        
        if (isForward) {
          // 向前计算：从初始日期下一天到目标日期
          dateRange = { gte: initialDateNextDay, lt: targetDate }
          multiplier = 1
        } else if (targetDate <= initialDate) {
          // 向后计算：从目标日期到初始日期（不含初始日期当天）
          dateRange = { gte: targetDate, lt: initialDate }
          multiplier = -1
        } else {
          // targetDate 在初始日期当天，返回初始余额
          dateBalanceMap.set(dateKey, initialBalance.toNumber())
          continue
        }

        const relevantFrom = accountFromTransactions.filter(t => {
          const tDate = t.date
          return tDate >= dateRange.gte && tDate < dateRange.lt
        })
        const relevantTo = accountToTransactions.filter(t => {
          const tDate = t.date
          return tDate >= dateRange.gte && tDate < dateRange.lt
        })

        const balance = applyTransactionsToBalance(initialBalance, relevantFrom, relevantTo, multiplier)
        dateBalanceMap.set(dateKey, balance.toNumber())
      }
    }

    result.set(accountId, dateBalanceMap)
  }

  return new BalanceCache(result)
}

export async function calculateBalanceAtDate(
  accountId: string,
  targetDate: Date
): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  })
  
  if (!account) return 0

  let balance = account.initialBalance
  
  if (!account.initialBalanceDate) {
    // 无初始余额日期，从最早交易开始计算
    const fromTransactions = await prisma.transaction.findMany({
      where: { accountId, date: { lt: targetDate } },
    })
    const toTransactions = await prisma.transaction.findMany({
      where: { toAccountId: accountId, date: { lt: targetDate } },
    })
    balance = applyTransactionsToBalance(balance, fromTransactions, toTransactions)
    return balance.toNumber()
  }

  const initialDate = account.initialBalanceDate
  // 初始余额日期代表当天结束，所以初始日期的下一天是计算的起点
  const initialDateNextDay = new Date(initialDate)
  initialDateNextDay.setDate(initialDateNextDay.getDate() + 1)
  
  const isForwardCalculation = targetDate >= initialDateNextDay

  let dateRange: { gte: Date; lt: Date }
  let multiplier: 1 | -1

  if (isForwardCalculation) {
    // 向前计算：从初始日期下一天到目标日期
    dateRange = { gte: initialDateNextDay, lt: targetDate }
    multiplier = 1
  } else if (targetDate <= initialDate) {
    // 向后计算：从目标日期到初始日期（不含初始日期当天）
    dateRange = { gte: targetDate, lt: initialDate }
    multiplier = -1
  } else {
    // targetDate 在初始日期当天，返回初始余额
    return balance.toNumber()
  }

  const [fromTransactions, toTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId, date: dateRange },
    }),
    prisma.transaction.findMany({
      where: { toAccountId: accountId, date: dateRange },
    }),
  ])

  balance = applyTransactionsToBalance(balance, fromTransactions, toTransactions, multiplier)
  return balance.toNumber()
}

export async function getOrCreateAdjustmentCategory(type: 'income' | 'expense'): Promise<string> {
  const existing = await prisma.transactionCategory.findFirst({
    where: { name: '平账调整', type }
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
