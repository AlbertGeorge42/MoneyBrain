/**
 * HF 报表纯函数：四视图父子合计、并排补行、列宽权重、投资列与下钻筛选。
 */
import { describe, it, expect } from 'vitest'
import { REPORT_PERIODS, type ReportRow, type ReportTableData } from '../../src/features/reports/reports-mock'
import { formatAmount } from '../../src/features/transactions/transaction-utils'
import {
  REPORT_COLUMNS,
  columnTotalValue,
  columnWidth,
  drillFilters,
  findRow,
  flatRows,
  rowAmount,
  rowTone,
  shareOf,
  sortRows,
  tableColumns,
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

  it('每个期间、四个视图的父项金额等于子项之和', () => {
    for (const period of periods) {
      for (const view of Object.values(period.views)) {
        for (const table of view.tables) {
          expectParentEqualsChildren(table.rows)
        }
      }
    }
  })

  it('资产负债视图两侧合计相等，权益 = 总资产 − 总负债', () => {
    for (const period of periods) {
      const [assets, liabilities] = period.views.balance.tables
      const equity = liabilities.rows.find((row) => row.id === 'equity')
      expect(equity).toBeDefined()
      expect(tableTotal(assets.rows)).toBe(tableTotal(liabilities.rows))
      expect(equity?.amount).toBeCloseTo(
        tableTotal(assets.rows) - tableTotal(liabilities.rows.filter((row) => row.id !== 'equity')),
        2,
      )
    }
  })

  it('收支视图结余 = 收入 + 支出（支出为负）', () => {
    for (const period of periods) {
      const [income, expense] = period.views.flows.tables
      expect(period.views.flows.metrics.main.value).toBe(formatAmount(tableTotal(income.rows) + tableTotal(expense.rows)))
    }
  })

  it('现金流为四格等宽指标，收支与资产负债为 1 主 + 3 格', () => {
    const cash = REPORT_PERIODS.month[2].views.cash
    expect(cash.metricsLayout).toBe('flat')
    expect(cash.tables).toHaveLength(2)
    expect([cash.metrics.main, ...cash.metrics.cells]).toHaveLength(4)
    expect(REPORT_PERIODS.month[2].views.flows.metricsLayout).toBeUndefined()
  })

  it('投资分析为单表 5 列，市值 = 成本 + 收益，收益率随市值一致', () => {
    for (const period of periods) {
      const table = period.views.investment.tables[0]
      expect(period.views.investment.tables).toHaveLength(1)
      expect(tableColumns(table)).toHaveLength(5)
      const marketValue = tableTotal(table.rows)
      const cost = columnTotalValue(table.rows, 'cost')
      const gain = columnTotalValue(table.rows, 'gain')
      expect(marketValue).toBeCloseTo(Number(cost) + Number(gain), 2)
      expect(columnTotalValue(table.rows, 'gainRate')).toBeCloseTo(Number(gain) / Number(cost), 6)
    }
  })

  it('四视图都有趋势与构成数据，走势末点与主指标同源', () => {
    const period = REPORT_PERIODS.month[2]
    for (const view of Object.values(period.views)) {
      expect(view.trend.length).toBeGreaterThanOrEqual(2)
      expect(view.composition.primary.items.length).toBeGreaterThan(0)
      expect(view.trend.at(-1)?.value).toBeCloseTo(
        Number(view.metrics.main.value.replace(/[^0-9.-]/g, '')),
        2,
      )
    }
  })

  it('月份 3 期、年份 2 期，每个视图表格数量正确', () => {
    expect(REPORT_PERIODS.month).toHaveLength(3)
    expect(REPORT_PERIODS.year).toHaveLength(2)
    expect(periods.every((period) =>
      period.views.flows.tables.length === 2 &&
      period.views.cash.tables.length === 2 &&
      period.views.balance.tables.length === 2 &&
      period.views.investment.tables.length === 1,
    )).toBe(true)
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

  it('投资五列的 colgroup 合计同样为 100%', () => {
    const table = REPORT_PERIODS.month[2].views.investment.tables[0]
    const columns = tableColumns(table)
    const widths = columns.map((col) => Number.parseFloat(columnWidth(col, 'mobile', columns)))
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100, 5)
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

describe('排序与下钻筛选', () => {
  const table: ReportTableData = REPORT_PERIODS.month[2].views.investment.tables[0]

  it('投资列按数值降序，父项排序但保留子项', () => {
    const rows = sortRows(table.rows, { key: 'gainRate', direction: 'desc' })
    const rates = rows.map((row) => row.values?.gainRate ?? 0)
    expect(rates).toEqual([...rates].sort((left, right) => right - left))
    expect(rows[0].children).toBe(table.rows.find((row) => row.id === rows[0].id)?.children)
  })

  it('收支叶子行带本期日期与查询词，汇总行没有出口', () => {
    const period = REPORT_PERIODS.month[2]
    const expense = period.views.flows.tables[1]
    const food = findRow(expense.rows, 'food')
    expect(food).not.toBeNull()
    expect(drillFilters(food as ReportRow, expense, period)).toEqual({
      categoryId: 'food',
      from: period.from,
      to: period.to,
    })

    const canteen = findRow(expense.rows, 'canteen') as ReportRow
    expect(drillFilters(canteen, expense, period)).toEqual({
      query: '公司食堂',
      from: period.from,
      to: period.to,
    })

    const cashGroup = period.views.cash.tables[0].rows[0]
    expect(cashGroup.match).toBeUndefined()
    expect(drillFilters(cashGroup, period.views.cash.tables[0], period)).toBeNull()
  })

  it('资产负债按账户筛选且不带日期，投资分析没有流水出口', () => {
    const period = REPORT_PERIODS.month[2]
    const assets = period.views.balance.tables[0]
    const cmb = findRow(assets.rows, 'cmb-card') as ReportRow
    expect(drillFilters(cmb, assets, period)).toEqual({ accountId: 'cmb' })
    expect(drillFilters(table.rows[0], table, period)).toBeNull()
  })
})
