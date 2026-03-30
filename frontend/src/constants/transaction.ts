export const TRANSACTION_TYPE_CONFIG: Record<string, { color: string; text: string }> = {
  income: { color: 'green', text: '收入' },
  expense: { color: 'red', text: '支出' },
  transfer: { color: 'blue', text: '转账' },
  refund: { color: 'orange', text: '退款' },
  adjustment: { color: 'purple', text: '平账' },
}
