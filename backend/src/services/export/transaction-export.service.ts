import { prisma } from '../../index.js'
import { escapeCsvField } from '../../common/utils.js'

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
      category: {
        include: { parent: true },
      },
      relatedTransaction: {
        include: { account: true, category: { include: { parent: true } } },
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
    // 正确输出分类层级：有父级时 category1=父名, category2=子名；无父级时 category1=分类名, category2=空
    let category1: string
    let category2: string
    if (t.category?.parentId && t.category.parent) {
      category1 = t.category.parent.name
      category2 = t.category.name
    } else {
      category1 = t.category?.name || '未分类'
      category2 = ''
    }
    let type: string
    if (t.type === 'income') type = '收入'
    else if (t.type === 'transfer') type = '转账'
    else if (t.type === 'refund') type = '退款'
    else type = '支出'

    const amount = t.amount.toNumber()
    const currency = 'CNY'
    const account1 = t.account?.name || ''
    const account2 = t.toAccount?.name || ''
    const fee = t.fee?.toNumber() || 0
    const coupon = t.coupon?.toNumber() || 0
    const recorder = 'MoneyBrain'
    const billMark = ''
    const tags = ''
    const images = ''
    const relatedBill = t.relatedTransactionId ? (idMap[t.relatedTransactionId] || '') : ''

    csvRows.push(
      [
        escapeCsvField(id),
        escapeCsvField(date),
        escapeCsvField(category1),
        escapeCsvField(category2),
        escapeCsvField(type),
        escapeCsvField(amount),
        escapeCsvField(currency),
        escapeCsvField(account1),
        escapeCsvField(account2),
        escapeCsvField(t.note || ''),
        escapeCsvField(''),
        escapeCsvField(fee),
        escapeCsvField(coupon),
        escapeCsvField(recorder),
        escapeCsvField(billMark),
        escapeCsvField(tags),
        escapeCsvField(images),
        escapeCsvField(relatedBill),
      ].join(',')
    )
  }

  return '\uFEFF' + csvRows.join('\n')
}
