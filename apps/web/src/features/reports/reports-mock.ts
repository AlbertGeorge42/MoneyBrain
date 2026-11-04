import { formatAmount, formatPercent, formatUnsigned } from '../transactions/transaction-utils'

export type ReportView = 'flows' | 'balance'
export type ReportGranularity = 'month' | 'year'
export type ReportTone = 'income' | 'expense' | 'neutral'

export type ReportRow = {
  id: string
  label: string
  /** 收支视图为正负号净额；资产负债视图为无符号金额。 */
  amount: number
  children?: ReportRow[]
}

export type ReportTableData = {
  id: string
  title: string
  /** signed 显示 +/−；unsigned 显示绝对值（资产 / 负债）。 */
  format: 'signed' | 'unsigned'
  tone: ReportTone
  rows: ReportRow[]
}

export type ReportMetric = {
  label: string
  value: string
  tone: ReportTone
  hint?: string
}

export type ReportMetrics = {
  main: ReportMetric
  cells: ReportMetric[]
}

export type ReportPeriod = {
  key: string
  granularity: ReportGranularity
  label: string
  asOf: string
  flows: {
    metrics: ReportMetrics
    tables: [ReportTableData, ReportTableData]
  }
  balance: {
    metrics: ReportMetrics
    tables: [ReportTableData, ReportTableData]
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100

function group(id: string, label: string, children: ReportRow[]): ReportRow {
  return {
    id,
    label,
    amount: round2(children.reduce((sum, child) => sum + child.amount, 0)),
    children,
  }
}

function leaf(id: string, label: string, amount: number): ReportRow {
  return { id, label, amount }
}

function tableTotal(rows: ReportRow[]): number {
  return round2(rows.reduce((sum, row) => sum + row.amount, 0))
}

function scaleRows(rows: ReportRow[], factor: number): ReportRow[] {
  return rows.map((row) => {
    if (!row.children) return { ...row, amount: round2(row.amount * factor) }
    const children = scaleRows(row.children, factor)
    return group(row.id, row.label, children)
  })
}

const MONTH_INCOME: ReportRow[] = [
  group('salary', '工资', [
    leaf('salary-base', '基本工资', 18000),
    leaf('salary-bonus', '奖金', 320),
  ]),
  leaf('investment-income', '理财收益', 312.4),
  leaf('reimbursement', '报销', 180),
]

const MONTH_EXPENSE: ReportRow[] = [
  group('housing', '居住', [
    leaf('rent', '房租', -5600),
    leaf('utilities', '水电燃气', -240),
  ]),
  group('food', '餐饮', [
    leaf('canteen', '公司食堂', -56),
    leaf('takeout', '外卖', -214.6),
    leaf('dinner', '晚餐', -82),
  ]),
  group('shopping', '购物', [
    leaf('market', '山姆会员店', -328.6),
    leaf('refund', '退货退款', 68),
  ]),
  leaf('transport', '交通', -151),
  leaf('entertainment', '娱乐', -79),
  leaf('health', '医疗', -120),
  leaf('education', '教育', -199),
  leaf('other-expense', '其他', -54.7),
]

const MONTH_ASSETS: ReportRow[] = [
  group('cash', '现金及等价物', [
    leaf('cmb-card', '招商银行储蓄卡（工资代发 · 尾号 8842）', 82340.5),
    leaf('wechat-wallet', '微信零钱', 1286.4),
    leaf('alipay-wallet', '支付宝余额', 2412.8),
    leaf('cash-on-hand', '现金', 320),
  ]),
  group('investment', '投资资产', [
    leaf('fund', '基金', 58600),
    leaf('stock', '股票', 42350.6),
  ]),
  leaf('receivable', '应收报销', 1200),
]

const MONTH_LIABILITIES: ReportRow[] = [
  group('credit', '负债', [
    leaf('cmb-credit', '招行信用卡', 3280.6),
    leaf('huabei', '花呗', 1152),
  ]),
]

const YEAR_INCOME: ReportRow[] = [
  group('salary-year', '工资', [
    leaf('salary-year-base', '基本工资', 204000),
    leaf('salary-year-bonus', '奖金', 12000),
  ]),
  leaf('investment-year', '理财收益', 4286.4),
  leaf('reimbursement-year', '报销', 1820),
]

const YEAR_EXPENSE: ReportRow[] = [
  group('housing-year', '居住', [
    leaf('rent-year', '房租', 67200),
    leaf('utilities-year', '水电燃气', 2880),
  ]),
  group('food-year', '餐饮', [
    leaf('canteen-year', '公司食堂', 1200),
    leaf('takeout-year', '外卖', 2412.6),
    leaf('dinner-year', '晚餐', 618.6),
  ]),
  group('shopping-year', '购物', [
    leaf('market-year', '山姆会员店', 3520),
    leaf('refund-year', '退货退款', 392.8),
  ]),
  leaf('transport-year', '交通', -1812),
  leaf('entertainment-year', '娱乐', -948),
  leaf('health-year', '医疗', -1440),
  leaf('education-year', '教育', -2388),
  leaf('other-year', '其他', -656.4),
]

const YEAR_ASSETS: ReportRow[] = [
  group('cash-year', '现金及等价物', [
    leaf('cmb-year', '招商银行储蓄卡（工资代发 · 尾号 8842）', 94300),
    leaf('wechat-year', '微信零钱', 2180.4),
    leaf('alipay-year', '支付宝余额', 5999.8),
    leaf('cash-year-hand', '现金', 1000),
  ]),
  group('investment-year-group', '投资资产', [
    leaf('fund-year', '基金', 68420.8),
    leaf('stock-year', '股票', 50000),
  ]),
  leaf('receivable-year', '应收报销', 2400),
]

const YEAR_LIABILITIES: ReportRow[] = [
  group('credit-year', '负债', [
    leaf('cmb-credit-year', '招行信用卡', 4210.8),
    leaf('huabei-year', '花呗', 1000),
  ]),
]

function flowsTables(incomeRows: ReportRow[], expenseRows: ReportRow[]): [ReportTableData, ReportTableData] {
  return [
    { id: 'income', title: '收入', format: 'signed', tone: 'income', rows: incomeRows },
    { id: 'expense', title: '支出', format: 'signed', tone: 'expense', rows: expenseRows },
  ]
}

function balanceTables(
  assetRows: ReportRow[],
  liabilityRows: ReportRow[],
  netForEquity: number,
): [ReportTableData, ReportTableData] {
  const assetsTotal = tableTotal(assetRows)
  const liabilitiesTotal = tableTotal(liabilityRows)
  const equityTotal = round2(assetsTotal - liabilitiesTotal)
  const openingEquity = round2(equityTotal - netForEquity)
  const equityRows: ReportRow[] = [
    group('equity', '权益', [
      leaf('opening-equity', '期初权益', openingEquity),
      leaf('period-result', '本期结余', netForEquity),
    ]),
  ]

  return [
    { id: 'assets', title: '资产', format: 'unsigned', tone: 'neutral', rows: assetRows },
    {
      id: 'liabilities',
      title: '负债与权益',
      format: 'unsigned',
      tone: 'neutral',
      rows: [...liabilityRows, ...equityRows],
    },
  ]
}

function flowsMetrics(incomeRows: ReportRow[], expenseRows: ReportRow[]): ReportMetrics {
  const income = tableTotal(incomeRows)
  const expense = tableTotal(expenseRows)
  const net = round2(income + expense)
  const rate = income === 0 ? 0 : net / income

  return {
    main: { label: '本期结余', value: formatAmount(net), tone: net < 0 ? 'expense' : 'income' },
    cells: [
      { label: '收入', value: formatAmount(income), tone: 'income' },
      { label: '支出', value: formatAmount(expense), tone: 'expense' },
      { label: '储蓄率', value: formatPercent(rate), tone: 'neutral', hint: '结余 / 收入' },
    ],
  }
}

function balanceMetrics(assetRows: ReportRow[], liabilityRows: ReportRow[]): ReportMetrics {
  const assets = tableTotal(assetRows)
  const liabilities = tableTotal(liabilityRows)
  const netWorth = round2(assets - liabilities)
  const equity = round2(netWorth)

  return {
    main: { label: '净资产', value: formatUnsigned(netWorth), tone: 'neutral' },
    cells: [
      { label: '总资产', value: formatUnsigned(assets), tone: 'neutral' },
      { label: '总负债', value: formatUnsigned(liabilities), tone: 'neutral' },
      { label: '权益合计', value: formatUnsigned(equity), tone: 'neutral', hint: '负债与权益合计 = 总资产' },
    ],
  }
}

function monthPeriod(key: string, asOf: string, factor: number): ReportPeriod {
  const incomeRows = scaleRows(MONTH_INCOME, factor)
  const expenseRows = scaleRows(MONTH_EXPENSE, factor)
  const assetRows = scaleRows(MONTH_ASSETS, factor)
  const liabilityRows = scaleRows(MONTH_LIABILITIES, factor)
  const net = round2(tableTotal(incomeRows) + tableTotal(expenseRows))

  return {
    key,
    granularity: 'month',
    label: key,
    asOf,
    flows: {
      metrics: flowsMetrics(incomeRows, expenseRows),
      tables: flowsTables(incomeRows, expenseRows),
    },
    balance: {
      metrics: balanceMetrics(assetRows, liabilityRows),
      tables: balanceTables(assetRows, liabilityRows, net),
    },
  }
}

function yearPeriod(key: string, asOf: string, factor: number): ReportPeriod {
  const incomeRows = scaleRows(YEAR_INCOME, factor)
  const expenseRows = scaleRows(YEAR_EXPENSE, factor)
  const assetRows = scaleRows(YEAR_ASSETS, factor)
  const liabilityRows = scaleRows(YEAR_LIABILITIES, factor)
  const net = round2(tableTotal(incomeRows) + tableTotal(expenseRows))

  return {
    key,
    granularity: 'year',
    label: key,
    asOf,
    flows: {
      metrics: flowsMetrics(incomeRows, expenseRows),
      tables: flowsTables(incomeRows, expenseRows),
    },
    balance: {
      metrics: balanceMetrics(assetRows, liabilityRows),
      tables: balanceTables(assetRows, liabilityRows, net),
    },
  }
}

/** 静态 mock：月 / 年各有一组可回退的期间，箭头到边界即禁用。 */
export const REPORT_PERIODS: Record<ReportGranularity, ReportPeriod[]> = {
  month: [
    monthPeriod('2026-09', '截至 2026-09-30', 0.9),
    monthPeriod('2026-10', '截至 2026-10-31', 0.94),
    monthPeriod('2026-11', '截至 2026-11-30', 1),
  ],
  year: [
    yearPeriod('2025', '截至 2025-12-31', 0.86),
    yearPeriod('2026', '截至 2026-12-31', 1),
  ],
}
