import { prisma } from '../index.js'

export type TransactionType = 'income' | 'expense' | 'transfer' | 'refund'

export interface BalanceChangeResult {
  mainAccountChange: number
  toAccountChange: number
}

/**
 * 计算交易对账户余额的影响
 * 
 * @param type 交易类型
 * @param amount 交易金额
 * @param fee 手续费
 * @param coupon 优惠券
 * @returns 余额变化结果
 * 
 * 计算规则：
 * - 收入：余额 += 金额 - 手续费 + 优惠券
 * - 支出：余额 -= 金额 + 手续费 - 优惠券
 * - 转账转出：余额 -= 金额 + 手续费 - 优惠券
 * - 退款：余额 += 金额 - 手续费
 */
export function calculateBalanceChange(
  type: TransactionType,
  amount: number,
  fee: number = 0,
  coupon: number = 0
): number {
  switch (type) {
    case 'income':
      return amount - fee + coupon
    case 'expense':
      return -(amount + fee - coupon)
    case 'transfer':
      return -(amount + fee - coupon)
    case 'refund':
      return amount - fee
    default:
      return 0
  }
}

/**
 * 计算转账转入账户的余额变化
 * 
 * @param amount 转账金额
 * @param fee 手续费
 * @param coupon 优惠券
 * @returns 转入账户余额变化
 * 
 * 转入账户余额 += 金额 - 手续费 + 优惠券
 */
export function calculateTransferInAmount(
  amount: number,
  fee: number = 0,
  coupon: number = 0
): number {
  return amount - fee + coupon
}

/**
 * 计算交易对相关账户的完整余额变化
 * 
 * @param type 交易类型
 * @param amount 交易金额
 * @param fee 手续费
 * @param coupon 优惠券
 * @returns 包含主账户和目标账户变化的完整结果
 */
export function calculateTransactionBalanceChange(
  type: TransactionType,
  amount: number,
  fee: number = 0,
  coupon: number = 0
): BalanceChangeResult {
  const mainAccountChange = calculateBalanceChange(type, amount, fee, coupon)
  const toAccountChange = type === 'transfer' ? calculateTransferInAmount(amount, fee, coupon) : 0
  
  return {
    mainAccountChange,
    toAccountChange,
  }
}

/**
 * 计算某个日期的账户余额
 * 
 * @param accountId 账户ID
 * @param targetDate 目标日期
 * @returns 计算得到的余额
 * 
 * 计算逻辑：
 * 1. 以初始余额为基准点，支持向前（历史）和向后（未来）推算
 * 2. 目标日期 >= 初始余额日期：从初始余额向后累加交易
 * 3. 目标日期 < 初始余额日期：从初始余额向前减去交易（反向计算）
 * 4. 统一处理收入、支出、转账、退款四种交易类型
 */
export async function calculateBalanceAtDate(
  accountId: string,
  targetDate: Date
): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  })
  
  if (!account) return 0

  const startBalance = account.initialBalance.toNumber()
  
  // 如果没有初始余额日期，从最早交易开始计算
  if (!account.initialBalanceDate) {
    const fromTransactions = await prisma.transaction.findMany({
      where: {
        accountId,
        date: { lt: targetDate },
      },
    })
    const toTransactions = await prisma.transaction.findMany({
      where: {
        toAccountId: accountId,
        date: { lt: targetDate },
      },
    })
    
    let balance = 0
    fromTransactions.forEach(t => {
      const amount = t.amount.toNumber()
      const fee = t.fee?.toNumber() || 0
      const coupon = t.coupon?.toNumber() || 0
      balance += calculateBalanceChange(t.type as TransactionType, amount, fee, coupon)
    })
    toTransactions.forEach(t => {
      const amount = t.amount.toNumber()
      const fee = t.fee?.toNumber() || 0
      const coupon = t.coupon?.toNumber() || 0
      if (t.type === 'transfer') {
        balance += calculateTransferInAmount(amount, fee, coupon)
      }
    })
    return balance
  }

  const initialDate = account.initialBalanceDate

  // 判断目标日期与初始余额日期的关系
  const isForwardCalculation = targetDate >= initialDate

  let balance = startBalance

  if (isForwardCalculation) {
    // 向后计算：累加初始余额日期到目标日期之间的交易
    const fromTransactions = await prisma.transaction.findMany({
      where: {
        accountId,
        date: { gte: initialDate, lt: targetDate },
      },
    })
    const toTransactions = await prisma.transaction.findMany({
      where: {
        toAccountId: accountId,
        date: { gte: initialDate, lt: targetDate },
      },
    })

    fromTransactions.forEach(t => {
      const amount = t.amount.toNumber()
      const fee = t.fee?.toNumber() || 0
      const coupon = t.coupon?.toNumber() || 0
      balance += calculateBalanceChange(t.type as TransactionType, amount, fee, coupon)
    })
    toTransactions.forEach(t => {
      const amount = t.amount.toNumber()
      const fee = t.fee?.toNumber() || 0
      const coupon = t.coupon?.toNumber() || 0
      if (t.type === 'transfer') {
        balance += calculateTransferInAmount(amount, fee, coupon)
      }
    })
  } else {
    // 向前计算：从初始余额减去目标日期到初始余额日期之间的交易
    const fromTransactions = await prisma.transaction.findMany({
      where: {
        accountId,
        date: { gte: targetDate, lt: initialDate },
      },
    })
    const toTransactions = await prisma.transaction.findMany({
      where: {
        toAccountId: accountId,
        date: { gte: targetDate, lt: initialDate },
      },
    })

    // 反向计算：减去这段时间的交易影响
    fromTransactions.forEach(t => {
      const amount = t.amount.toNumber()
      const fee = t.fee?.toNumber() || 0
      const coupon = t.coupon?.toNumber() || 0
      balance -= calculateBalanceChange(t.type as TransactionType, amount, fee, coupon)
    })
    toTransactions.forEach(t => {
      const amount = t.amount.toNumber()
      const fee = t.fee?.toNumber() || 0
      const coupon = t.coupon?.toNumber() || 0
      if (t.type === 'transfer') {
        balance -= calculateTransferInAmount(amount, fee, coupon)
      }
    })
  }

  return balance
}

/**
 * 获取或创建平账分类
 * 
 * @param type 分类类型（收入或支出）
 * @returns 分类ID
 */
export async function getOrCreateAdjustmentCategory(type: 'income' | 'expense'): Promise<string> {
  const existing = await prisma.category.findFirst({
    where: { name: '平账调整', type },
  })
  
  if (existing) return existing.id

  const category = await prisma.category.create({
    data: {
      name: '平账调整',
      type,
      icon: '⚙️',
    },
  })
  
  return category.id
}
