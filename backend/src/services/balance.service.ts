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
 * 1. 如果目标日期在初始余额日期之前，返回0
 * 2. 从初始余额开始，累加/减去目标日期之前的所有交易
 * 3. 统一处理收入、支出、转账、退款四种交易类型
 */
export async function calculateBalanceAtDate(
  accountId: string,
  targetDate: Date
): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  })
  
  if (!account) return 0

  // 如果目标日期在初始余额日期之前，返回0
  if (account.initialBalanceDate && targetDate < account.initialBalanceDate) {
    return 0
  }

  // 获取初始余额和日期
  const startDate = account.initialBalanceDate || new Date(0)
  const startBalance = account.initialBalance.toNumber()

  // 查询该账户作为转出方的交易（收入、支出、转账转出）
  const fromTransactions = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: startDate, lt: targetDate },
    },
  })

  // 查询该账户作为转入方的交易（转账转入）
  const toTransactions = await prisma.transaction.findMany({
    where: {
      toAccountId: accountId,
      date: { gte: startDate, lt: targetDate },
    },
  })

  let balance = startBalance

  // 统一计算逻辑：收入增加余额，支出减少余额
  fromTransactions.forEach(t => {
    const amount = t.amount.toNumber()
    const fee = t.fee?.toNumber() || 0
    const coupon = t.coupon?.toNumber() || 0
    
    balance += calculateBalanceChange(t.type as TransactionType, amount, fee, coupon)
  })

  // 处理转入方交易
  toTransactions.forEach(t => {
    const amount = t.amount.toNumber()
    const fee = t.fee?.toNumber() || 0
    const coupon = t.coupon?.toNumber() || 0
    
    if (t.type === 'transfer') {
      // 转入：余额 += 金额 - 手续费 + 优惠券
      balance += calculateTransferInAmount(amount, fee, coupon)
    }
  })

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
