import { prisma } from '../index.js'

export async function exportTransactionsCSV(startDate?: Date, endDate?: Date): Promise<string> {
  const transactions = await prisma.transaction.findMany({
    where: {
      ...(startDate || endDate ? {
        date: {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        },
      } : {}),
    },
    include: {
      account: true,
      toAccount: true,
      category: true,
      relatedTransaction: {
        include: { account: true, category: true },
      },
    },
    orderBy: { date: 'desc' },
  })

  const idMap: Record<string, string> = {}
  transactions.forEach(t => {
    idMap[t.id] = `mb${Date.now()}${Math.random().toString(36).substr(2, 9)}`
  })

  const csvRows: string[] = []
  csvRows.push('ID,时间,分类,二级分类,类型,金额,币种,账户1,账户2,备注,已报销,手续费,优惠券,记账者,账单标记,标签,账单图片,关联账单')

  for (const t of transactions) {
    const id = idMap[t.id]
    const date = new Date(t.date)
      .toLocaleString('zh-CN', { hour12: false })
      .replace(/\//g, '-')
    const category1 = t.category?.name || '未分类'
    const category2 = ''
    let type: string
    if (t.type === 'income') type = '收入'
    else if (t.type === 'transfer') type = '转账'
    else if (t.type === 'refund') type = '退款'
    else type = '支出'

    const amount = t.amount.toNumber()
    const currency = 'CNY'
    const account1 = t.account?.name || ''
    const account2 = t.toAccount?.name || ''
    const note = (t.note || '').replace(/,/g, '，').replace(/\n/g, ' ')
    const reimbursed = ''
    const fee = t.fee?.toNumber() || 0
    const coupon = t.coupon?.toNumber() || 0
    const recorder = 'MoneyBrain'
    const billMark = ''
    const tags = ''
    const images = ''
    const relatedBill = t.relatedTransactionId ? (idMap[t.relatedTransactionId] || '') : ''

    csvRows.push(
      `${id},${date},${category1},${category2},${type},${amount},${currency},${account1},${account2},${note},${reimbursed},${fee},${coupon},${recorder},${billMark},${tags},${images},${relatedBill}`
    )
  }

  return '\uFEFF' + csvRows.join('\n')
}

export async function clearAllData(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.budgetAlert.deleteMany()
    await tx.budget.deleteMany()
    await tx.transaction.deleteMany()
    await tx.account.deleteMany()
    await tx.accountCategory.deleteMany({ where: { parentId: { not: null } } })
    await tx.accountCategory.deleteMany()
    await tx.transactionCategory.deleteMany({ where: { parentId: { not: null } } })
    await tx.transactionCategory.deleteMany()
  })
}

export async function clearTransactionsOnly(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.budgetAlert.deleteMany()
    await tx.budget.deleteMany()
    await tx.transaction.deleteMany()
  })
}
