import { TransactionFormType } from '../components/transactions/TransactionForm'

export const formatTransactionSubmitValues = (
  values: any,
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
