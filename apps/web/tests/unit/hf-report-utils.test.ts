/**
 * HF 报表纯函数：父子合计、并排补行、列宽权重与资产负债表恒等式。
 */
import { describe, it, expect } from 'vitest'
import { REPORT_PERIODS, type ReportRow } from '../../src/features/reports/reports-mock'
import { formatAmount } from '../../src/features/transactions/transaction-utils'
import {
  REPORT_COLUMNS,
  columnWidth,
  findRow,
  flatRows,
  rowAmount,
  rowTone,
  shareOf,
  tableTotal,
} from '../../src/features/reports/report-utils'

function expectParentEqualsChildren(rows: ReportRow[]) {
  for (const row of rows) {
    if (!row.children) continue
    const sum = Math.round(row.children.reduce((total, child) => total + child.amount, 0) * 100) / 100
    expect(row.amount).toBe(sum)
    expectParentEqualsChildren(row.children)
  }
}

describe('报表 mock', () => {
  const periods = [...REPORT_PERIODS.month, ...REPORT_PERIODS.year]

  it('每个期间、每个视图的父项金额等于子项之和', () => {
    for (const period of periods) {
      for (const view of [period.flows, period.balance]) {
        for (const table of view.tables) {
          expectParentEqualsChildren(table.rows)
        }
      }
    }
  })

  it('资产负债视图两侧合计相等，权益 = 总资产 − 总负债', () => {
    for (const period of periods) {
      const [assets, liabilities] = period.balance.tables
      expect(tableTotal(assets.rows)).toBe(tableTotal(liabilities.rows))

      const equity = liabilities.rows.find((row) => row.id === 'equity')
      expect(equity).toBeDefined()
      expect(equity?.amount).toBeCloseTo(
        tableTotal(assets.rows) - tableTotal(liabilities.rows.filter((row) => row.id !== 'equity')),
        2,
      )
    }
  })

  it('收支视图结余 = 收入 + 支出（支出为负）', () => {
    for (const period of periods) {
      const [income, expense] = period.flows.tables
      expect(period.flows.metrics.main.value).toBe(formatAmount(tableTotal(income.rows) + tableTotal(expense.rows)))
    }
  })

  it('每个视图都有两张表，月份可回退到 3 期、年份 2 期', () => {
    expect(REPORT_PERIODS.month).toHaveLength(3)
    expect(REPORT_PERIODS.year).toHaveLength(2)
    expect(periods.every((period) => period.flows.tables.length === 2 && period.balance.tables.length === 2)).toBe(true)
  })
})

describe('flatRows / findRow', () => {
  const rows: ReportRow[] = [
    {
      id: 'parent',
      label: '居住',
      amount: -5840,
      children: [
        { id: 'rent', label: '房租', amount: -5600 },
        { id: 'utilities', label: '水电', amount: -240 },
      ],
    },
  ]

  it('父项展开时子行紧跟其后', () => {
    const flat = flatRows(rows, new Set(), 'expense')
    expect(flat.map((item) => item.row.id)).toEqual(['parent', 'rent', 'utilities'])
    expect(flat.map((item) => item.level)).toEqual([0, 1, 1])
  })

  it('按「表名:父项」折叠后只剩父项', () => {
    const flat = flatRows(rows, new Set(['expense:parent']), 'expense')
    expect(flat.map((item) => item.row.id)).toEqual(['parent'])
    expect(flat[0].expanded).toBe(false)
  })

  it('折叠键带表名，另一张同名父项不受影响', () => {
    const flat = flatRows(rows, new Set(['income:parent']), 'expense')
    expect(flat).toHaveLength(3)
  })

  it('详情按 id 找到任意层级', () => {
    expect(findRow(rows, 'utilities')?.label).toBe('水电')
    expect(findRow(rows, 'missing')).toBeNull()
  })
})

describe('列宽与金额口径', () => {
  it('列宽由语义权重推导，三列合计 100%', () => {
    const widths = REPORT_COLUMNS.map((col) => Number.parseFloat(columnWidth(col)))
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100, 5)
    expect(widths[0]).toBeGreaterThan(widths[1])
  })

  it('占比按绝对值计算，合计行恒为 100%', () => {
    expect(shareOf(-500, -1000)).toBeCloseTo(0.5)
    expect(shareOf(68, -1000)).toBeCloseTo(0.068)
  })

  it('收支表带符号，资产负债表不带符号', () => {
    expect(rowAmount({ id: 'a', label: '收入', amount: 200 }, { format: 'signed' })).toBe('+¥200.00')
    expect(rowAmount({ id: 'b', label: '资产', amount: 200 }, { format: 'unsigned' })).toBe('¥200.00')
  })

  it('金额颜色与符号一致：支出表里的退款用收入色', () => {
    expect(rowTone(-10, 'expense')).toBe('expense')
    expect(rowTone(10, 'expense')).toBe('income')
    expect(rowTone(10, 'neutral')).toBe('neutral')
  })
})
