import { prisma } from '../../prisma.js'
import { escapeCsvField } from '../../common/utils.js'
import { formatAmount, minor } from '../../../../../packages/domain/src/index.js'

/** 固定本地时间格式，避免不同区域设置导出成无法回读的日期。 */
function formatDateTime(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ')
}

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
    // 优先复用导入源 ID，保证同一份数据反复导出/导入仍然幂等；
    // 手工创建的交易没有 importKey，就使用稳定的数据库 UUID。
    idMap[t.id] = t.importKey?.startsWith('csv:') ? t.importKey.slice(4) : t.id
  })

  const csvRows: string[] = []
  csvRows.push('ID,时间,分类,二级分类,类型,金额,币种,账户1,账户2,备注,已报销,手续费,优惠券,记账者,账单标记,标签,账单图片,关联账单,口径版本')

  for (const t of transactions) {
    const id = idMap[t.id]
    const date = formatDateTime(new Date(t.date))
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
    else if (t.type === 'adjustment') type = '调整'
    else type = '支出'

    const amount = formatAmount(minor(Number(t.amount)))
    const currency = 'CNY'
    const account1 = t.account?.name || ''
    const account2 = t.toAccount?.name || ''
    const fee = formatAmount(minor(Number(t.fee ?? 0)))
    const coupon = formatAmount(minor(Number(t.coupon ?? 0)))
    const recorder = 'MoneyBrain'
    const billMark = t.excludeFromIncomeExpense ? '不计收支' : ''
    // 当前数据模型没有标签、账单图片与报销字段，保留空列以兼容旧 CSV 表头。
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
        escapeCsvField(String(t.ruleVersion)),
      ].join(',')
    )
  }

  return '\uFEFF' + csvRows.join('\n')
}
