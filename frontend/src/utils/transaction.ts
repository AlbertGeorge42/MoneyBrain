import dayjs from 'dayjs'
import { Transaction } from '../services/api'
import { TransactionFormType } from '../components/transactions/TransactionForm'

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

export const formatTransactionSubmitValues = (
  values: TransactionFormValues,
  type: TransactionFormType
) => {
  if (type === 'transfer') {
    return {
      type: 'transfer',
      amount: values.amount,
      fee: values.fee || 0,
      coupon: values.coupon || 0,
      date: values.date.format('YYYY-MM-DD'),
      accountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      categoryId: values.categoryId,
      note: values.note,
    }
  }

  return {
    type,
    amount: values.amount,
    fee: values.fee || 0,
    coupon: values.coupon || 0,
    date: values.date.format('YYYY-MM-DD'),
    accountId: values.accountId,
    categoryId: values.categoryId,
    note: values.note,
  }
}
