import { prisma } from '../../index.js'
import { escapeCsvField } from '../../common/utils.js'
import { Decimal } from '@prisma/client/runtime/library.js'

// 辅助函数：转义 Decimal 字段为 CSV 字符串
const escapeDecimal = (v: Decimal | number | string | null | undefined): string =>
  escapeCsvField(v == null ? null : String(v))

/**
 * 导出投资快照为 CSV 格式
 * 资产类别已移至 config 导出
 */
export async function exportInvestmentSnapshotsCSV(): Promise<string> {
  const snapshots = await prisma.investmentAllocationSnapshot.findMany({
    include: {
      account: { select: { name: true } },
      previousSnapshot: { select: { date: true } },
      items: {
        include: { assetClass: true },
        orderBy: { sort: 'asc' }
      }
    },
    orderBy: [{ accountId: 'asc' }, { date: 'asc' }]
  })

  // CSV 表头
  const headers = [
    '账户名称',
    '快照日期',
    '账户余额',
    '上次快照日期',
    '备注',
    '资产类别',
    '市值',
    '期内净流入',
    '排序'
  ]

  const rows: string[] = [headers.join(',')]

  for (const s of snapshots) {
    const commonFields = [
      escapeCsvField(s.account.name),
      escapeCsvField(s.date.toISOString()),
      escapeDecimal(s.accountBalance),
      escapeCsvField(s.previousSnapshot?.date.toISOString() ?? ''),
      escapeCsvField(s.note ?? '')
    ]

    if (s.items.length === 0) {
      // 没有分配项时也输出一行（保留快照信息）
      rows.push([...commonFields, '', '', '', ''].join(','))
    } else {
      for (const item of s.items) {
        rows.push([
          ...commonFields,
          escapeCsvField(item.assetClass.name),
          escapeDecimal(item.marketValue),
          escapeDecimal(item.periodNetFlow),
          escapeCsvField(item.sort)
        ].join(','))
      }
    }
  }

  // 添加 UTF-8 BOM 以便 Excel 正确识别中文
  return '\uFEFF' + rows.join('\n')
}
