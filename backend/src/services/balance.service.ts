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
 * 计算方向类型
 */
type CalculationDirection = 'forward' | 'backward' | 'same'

/**
 * 日期范围类型
 */
interface DateRange {
  gte: Date
  lt: Date
}

/**
 * 根据查询日期和初始余额日期，确定计算方向、日期范围和 multiplier
 * 
 * @param targetDate 查询日期（实际是查询截止日期的下一天）
 * @param initialDate 初始余额日期
 * @returns 计算方向、日期范围和 multiplier，或 null 表示返回初始余额
 */
function getDateRangeAndMultiplier(
  targetDate: Date,
  initialDate: Date
): { direction: CalculationDirection; dateRange: DateRange; multiplier: 1 | -1 } | null {
  // 初始余额日期的下一天
  const initialDateNextDay = new Date(initialDate)
  initialDateNextDay.setDate(initialDateNextDay.getDate() + 1)
  
  // 确定计算方向
  if (targetDate >= initialDateNextDay) {
    // Forward：查询日期在初始余额日期之后
    // 范围：从 initialDate + 1 到 targetDate（不含 targetDate）
    // 不包含 initialDate 当天的交易（因为余额是期末余额）
    return {
      direction: 'forward',
      dateRange: { gte: initialDateNextDay, lt: targetDate },
      multiplier: 1
    }
  } else if (targetDate < initialDate) {
    // Backward：查询日期在初始余额日期之前
    // 范围：从 targetDate 到 initialDate + 1（含 initialDate 当天）
    // 包含 initialDate 当天的交易（需要从期末余额倒推）
    // 不包含查询截止日期当天的交易（已反映在当天余额中）
    const initialDateNextDayForBackward = new Date(initialDate)
    initialDateNextDayForBackward.setDate(initialDateNextDayForBackward.getDate() + 1)
    return {
      direction: 'backward',
      dateRange: { gte: targetDate, lt: initialDateNextDayForBackward },
      multiplier: -1
    }
  } else {
    // Same：查询日期等于初始余额日期，返回初始余额
    return null
  }
}

/**
 * 根据日期范围筛选交易
 */
function filterTransactionsByRange<T extends { date: Date }>(
  transactions: T[],
  dateRange: DateRange
): T[] {
  return transactions.filter(t => {
    const tDate = t.date
    return tDate >= dateRange.gte && tDate < dateRange.lt
  })
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
  const maxTargetDate = sortedDates[sortedDates.length - 1]
  // 需要查询到最大日期的下一天（因为计算使用 lt: targetDate）
  let maxDate = new Date(maxTargetDate.getTime() + 86400000)

  // backward 计算需要覆盖到 initialBalanceDate，所以 maxDate 要至少覆盖到最晚的 initialBalanceDate + 1 day
  const latestInitialBalanceDate = accounts.reduce<Date | null>((acc, a) => {
    if (a.initialBalanceDate && (!acc || a.initialBalanceDate.getTime() > acc.getTime())) {
      return a.initialBalanceDate
    }
    return acc
  }, null)
  if (latestInitialBalanceDate) {
    const initialDateNextDay = new Date(latestInitialBalanceDate.getTime() + 86400000)
    if (initialDateNextDay.getTime() > maxDate.getTime()) {
      maxDate = initialDateNextDay
    }
  }

  // 修复历史余额计算：查询起点取所有账户"相关交易最早可能出现的日期"的最小值。
  // - 有 initialBalanceDate 的账户：起点为 initialBalanceDate + 1 day
  //   （因为 backward/forward 计算都基于此日期向后/向前推，之前的交易已被 initialBalance 反映）
  // - 无 initialBalanceDate 的账户：起点为 createdAt
  // 因为 backward 计算需要覆盖到查询截止日期前一天，所以起点要再往前推一天。
  // 关键场景：用户导入历史数据时，createdAt 是导入时间（较晚），但 initialBalanceDate 是历史时点（较早），
  // 若用 earliestCreatedAt 作为起点会漏掉 initialBalanceDate+1 day 与 createdAt 之间的交易，
  // 导致资产负债表 / 现金流量表 / 收支表的"实际"余额严重偏离。
  const earliestRelevantDate = accounts.reduce<Date | null>((acc, a) => {
    let candidate: Date | null = null
    if (a.initialBalanceDate) {
      candidate = new Date(a.initialBalanceDate.getTime() + 86400000)
    } else if (a.createdAt) {
      candidate = a.createdAt
    }
    if (candidate && (!acc || candidate.getTime() < acc.getTime())) return candidate
    return acc
  }, null)
  const earliestQueryDate = new Date(sortedDates[0])
  earliestQueryDate.setDate(earliestQueryDate.getDate() - 1)
  const minDate = earliestRelevantDate && earliestRelevantDate.getTime() < earliestQueryDate.getTime()
    ? earliestRelevantDate
    : earliestQueryDate

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
        // 有初始余额日期，使用统一的计算框架
        const result = getDateRangeAndMultiplier(targetDate, initialDate)
        
        if (result === null) {
          // targetDate 等于 initialDate，返回初始余额
          dateBalanceMap.set(dateKey, initialBalance.toNumber())
          continue
        }
        
        // 使用统一的筛选函数
        const relevantFrom = filterTransactionsByRange(accountFromTransactions, result.dateRange)
        const relevantTo = filterTransactionsByRange(accountToTransactions, result.dateRange)
        
        // 应用交易变动
        const balance = applyTransactionsToBalance(initialBalance, relevantFrom, relevantTo, result.multiplier)
        dateBalanceMap.set(dateKey, balance.toNumber())
      }
    }

    result.set(accountId, dateBalanceMap)
  }

  return new BalanceCache(result)
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
