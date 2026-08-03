import dayjs from 'dayjs'
import { Transaction, TransactionType } from '../services/api'

export interface TransactionGroup {
  date: string
  dayLabel: string
  weekDay: string
  income: number
  expense: number
  transactions: Transaction[]
}

const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function groupTransactionsByDate(transactions: Transaction[]): TransactionGroup[] {
  const groups = new Map<string, Transaction[]>()

  for (const tx of transactions) {
    const dateKey = dayjs(tx.date).format('YYYY-MM-DD')
    if (!groups.has(dateKey)) {
      groups.set(dateKey, [])
    }
    groups.get(dateKey)!.push(tx)
  }

  const sortedDates = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a))

  return sortedDates.map(date => {
    const txs = groups.get(date)!
    const d = dayjs(date)
    const isCurrentYear = d.year() === dayjs().year()

    let income = 0
    let expense = 0
    for (const tx of txs) {
      if (tx.type === 'income') income += tx.amount
      if (tx.type === 'expense') expense += tx.amount
    }

    return {
      date,
      dayLabel: isCurrentYear ? d.format('MM-DD') : d.format('YYYY-MM-DD'),
      weekDay: WEEK_DAYS[d.day()],
      income,
      expense,
      transactions: txs,
    }
  })
}

interface TransactionFormValues {
  amount: number
  fee?: number
  coupon?: number
  date: { format: (fmt: string) => string }
  accountId?: string
  fromAccountId?: string
  toAccountId?: string
  categoryId?: string
  note?: string
}

/**
 * 计算包含手续费/优惠券的真实金额（存入数据库）
 * - expense/transfer: 真实支出 = 录入金额 + 手续费 - 优惠券
 * - income/refund: 真实收入 = 录入金额 - 手续费 + 优惠券
 */
function computeRealAmount(
  amount: number,
  fee: number,
  coupon: number,
  type: TransactionType
): number {
  if (type === 'expense' || type === 'transfer') {
    return amount + (fee || 0) - (coupon || 0)
  }
  // income / refund
  return amount - (fee || 0) + (coupon || 0)
}

/**
 * 反向计算原始录入金额（用于编辑时表单显示）
 * - expense/transfer: 录入金额 = 存储金额 - 手续费 + 优惠券
 * - income/refund: 录入金额 = 存储金额 + 手续费 - 优惠券
 */
export function reverseComputeOriginalAmount(
  storedAmount: number,
  fee: number,
  coupon: number,
  type: TransactionType
): number {
  if (type === 'expense' || type === 'transfer') {
    return storedAmount - (fee || 0) + (coupon || 0)
  }
  // income / refund
  return storedAmount + (fee || 0) - (coupon || 0)
}

export const formatTransactionSubmitValues = (
  values: TransactionFormValues,
  type: TransactionType
) => {
  const fee = values.fee || 0
  const coupon = values.coupon || 0
  const realAmount = computeRealAmount(values.amount, fee, coupon, type)

  if (type === 'transfer') {
    return {
      type: 'transfer',
      amount: realAmount,
      fee,
      coupon,
      date: values.date.format('YYYY-MM-DD'),
      accountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      categoryId: values.categoryId,
      note: values.note,
    }
  }

  return {
    type,
    amount: realAmount,
    fee,
    coupon,
    date: values.date.format('YYYY-MM-DD'),
    accountId: values.accountId,
    categoryId: values.categoryId,
    note: values.note,
  }
}
