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
      // 退款按原交易类型冲减当日合计，避免日汇总与收支表口径不一致
      if (tx.type === 'refund') {
        if (tx.relatedType === 'income') income -= tx.amount
        if (tx.relatedType === 'expense') expense -= tx.amount
      }
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
  /** 不计收支标记（仅收入/支出可设置） */
  excludeFromIncomeExpense?: boolean
}

/**
 * 计算存入数据库的金额。
 * - 转账：amount 是本金，手续费/优惠券单独存放，避免被贷记到转入账户
 * - 收入/支出/退款：amount 是净现金流（手续费/优惠券已折算）
 */
function computeRealAmount(
  amount: number,
  fee: number,
  coupon: number,
  type: TransactionType
): number {
  if (type === 'transfer') {
    return amount
  }
  if (type === 'expense') {
    return amount + (fee || 0) - (coupon || 0)
  }
  // income / refund
  return amount - (fee || 0) + (coupon || 0)
}

/**
 * 反向计算原始录入金额（用于编辑时表单显示）。
 * 转账的本金就是存储金额；其他类型按净现金流还原。
 */
export function reverseComputeOriginalAmount(
  storedAmount: number,
  fee: number,
  coupon: number,
  type: TransactionType
): number {
  if (type === 'transfer') {
    return storedAmount
  }
  if (type === 'expense') {
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
      // 转账不涉及收支，显式传 false
      excludeFromIncomeExpense: false,
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
    excludeFromIncomeExpense: !!values.excludeFromIncomeExpense,
  }
}
