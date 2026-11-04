import { formatAmount, formatPercent, formatUnsigned } from '../transactions/transaction-utils'

export type ReportView = 'flows' | 'cash' | 'balance' | 'investment'
export type ReportGranularity = 'month' | 'year'
export type ReportTone = 'income' | 'expense' | 'neutral'

/** 行下钻到流水时使用的筛选锚点；没有锚点的汇总行不提供流水出口。 */
export type DrillMatch = {
  categoryId?: string
  accountId?: string
  query?: string
}

export type ReportColumnKey =
  | 'main'
  | 'share'
  | 'amount'
  | 'marketValue'
  | 'cost'
  | 'gain'
  | 'gainRate'

export type ReportColumn = {
  key: ReportColumnKey
  label: string
  align: 'start' | 'end'
  weight: number
  format: 'text' | 'signed' | 'unsigned' | 'percent'
  /** 金额颜色：auto 按符号，neutral 恒中性。 */
  tone: 'auto' | 'neutral'
  sortable?: boolean
}

export type ReportRow = {
  id: string
  label: string
  /** 收支 / 现金流为正负号净额；资产负债与投资为无符号金额。 */
  amount: number
  children?: ReportRow[]
  /** 投资持仓的市值 / 成本 / 收益 / 收益率；其他视图不填。 */
  values?: Partial<Record<'marketValue' | 'cost' | 'gain' | 'gainRate', number>>
  match?: DrillMatch
}

export type ReportTableData = {
  id: string
  title: string
  kind: ReportView
  /** signed 显示 +/−；unsigned 显示绝对值（资产 / 负债 / 现金流 / 持仓）。 */
  format: 'signed' | 'unsigned'
  tone: ReportTone
  rows: ReportRow[]
  /** 不填时使用报表默认三列（类别 / 占比 / 金额）。 */
  columns?: ReportColumn[]
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

export type TrendDatum = {
  label: string
  value: number
}

export type CompositionItem = {
  label: string
  value: number
}

export type CompositionPanel = {
  title: string
  tone: ReportTone
  format: 'signed' | 'unsigned'
  total: number
  items: CompositionItem[]
}

export type ReportComposition = {
  primary: CompositionPanel
  secondary?: CompositionPanel
  /** 窄屏只画副图（收支的支出构成 / 现金流与资产负债的流出、负债侧）。 */
  mobileSide: 'primary' | 'secondary'
}

export type ReportViewData = {
  metrics: ReportMetrics
  /** flat = 四格等宽（现金流口径）；默认 1 主 + 3 格。 */
  metricsLayout?: 'main' | 'flat'
  tables: ReportTableData[]
  trend: TrendDatum[]
  trendLabel: string
  composition: ReportComposition
}

export type ReportPeriod = {
  key: string
  granularity: ReportGranularity
  label: string
  asOf: string
  from: string
  to: string
  views: Record<ReportView, ReportViewData>
}

const round2 = (value: number) => Math.round(value * 100) / 100

function aggregateValues(children: ReportRow[]): ReportRow['values'] | undefined {
  if (!children.some((child) => child.values)) return undefined
  const marketValue = round2(children.reduce((sum, child) => sum + (child.values?.marketValue ?? 0), 0))
  const cost = round2(children.reduce((sum, child) => sum + (child.values?.cost ?? 0), 0))
  const gain = round2(marketValue - cost)
  return { marketValue, cost, gain, gainRate: cost === 0 ? 0 : gain / cost }
}

function group(id: string, label: string, children: ReportRow[], match?: DrillMatch): ReportRow {
  return {
    id,
    label,
    amount: round2(children.reduce((sum, child) => sum + child.amount, 0)),
    children,
    values: aggregateValues(children),
    match,
  }
}

function leaf(
  id: string,
  label: string,
  amount: number,
  match?: DrillMatch,
  values?: ReportRow['values'],
): ReportRow {
  return { id, label, amount, match, values }
}

function holding(id: string, label: string, marketValue: number, cost: number): ReportRow {
  const gain = round2(marketValue - cost)
  return leaf(id, label, marketValue, undefined, {
    marketValue,
    cost,
    gain,
    gainRate: cost === 0 ? 0 : gain / cost,
  })
}

function tableTotal(rows: ReportRow[]): number {
  return round2(rows.reduce((sum, row) => sum + row.amount, 0))
}

function scaleRows(rows: ReportRow[], factor: number): ReportRow[] {
  return rows.map((row) => {
    if (!row.children) {
      if (!row.values) return { ...row, amount: round2(row.amount * factor) }
      const marketValue = round2((row.values.marketValue ?? row.amount) * factor)
      const cost = round2((row.values.cost ?? 0) * factor)
      const gain = round2(marketValue - cost)
      return {
        ...row,
        amount: round2(row.amount * factor),
        values: { marketValue, cost, gain, gainRate: cost === 0 ? 0 : gain / cost },
      }
    }
    return group(row.id, row.label, scaleRows(row.children, factor), row.match)
  })
}

function composition(
  title: string,
  rows: ReportRow[],
  tone: ReportTone,
  format: 'signed' | 'unsigned',
  limit = 5,
): CompositionPanel {
  const total = tableTotal(rows)
  const sorted = [...rows].sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
  const top = sorted.slice(0, limit).map((row) => ({ label: row.label, value: row.amount }))
  const rest = sorted.slice(limit)
  if (rest.length > 0) {
    top.push({ label: '其他', value: round2(rest.reduce((sum, row) => sum + row.amount, 0)) })
  }
  return { title, tone, format, total, items: top }
}

const MONTH_LABELS = ['6月', '7月', '8月', '9月', '10月', '11月']

/** 生成以当前值为终点的走势，保证图表末点与指标主值一致。 */
function trendEndingAt(total: number, ratios: number[]): TrendDatum[] {
  return [
    ...ratios.map((ratio, index) => ({ label: MONTH_LABELS[index], value: round2(total * ratio) })),
    { label: MONTH_LABELS[5], value: total },
  ]
}

const TREND_RATIOS = [0.82, 0.86, 0.89, 0.93, 0.97]

// ---------- 收支明细 ----------

const MONTH_INCOME: ReportRow[] = [
  group('salary', '工资', [
    leaf('salary-base', '基本工资', 18000, { query: '工资' }),
    leaf('salary-bonus', '奖金', 320, { query: '奖金' }),
  ], { categoryId: 'salary' }),
  leaf('investment-income', '理财收益', 312.4, { categoryId: 'invest', query: '理财' }),
  leaf('reimbursement', '报销', 180, { categoryId: 'reimburse', query: '报销' }),
]

const MONTH_EXPENSE: ReportRow[] = [
  group('housing', '居住', [
    leaf('rent', '房租', -5600, { query: '房租' }),
    leaf('utilities', '水电燃气', -240, { query: '水电' }),
  ], { categoryId: 'home' }),
  group('food', '餐饮', [
    leaf('canteen', '公司食堂', -56, { query: '公司食堂' }),
    leaf('takeout', '外卖', -214.6, { query: '外卖' }),
    leaf('dinner', '晚餐', -82, { query: '晚餐' }),
  ], { categoryId: 'food' }),
  group('shopping', '购物', [
    leaf('market', '山姆会员店', -328.6, { query: '山姆' }),
    leaf('refund', '退货退款', 68, { query: '退货' }),
  ], { categoryId: 'shopping' }),
  leaf('transport', '交通', -151, { categoryId: 'transport' }),
  leaf('entertainment', '娱乐', -79, { categoryId: 'fun' }),
  leaf('health', '医疗', -120, { categoryId: 'health' }),
  leaf('education', '教育', -199, { categoryId: 'education' }),
  leaf('other-expense', '其他', -54.7, { categoryId: 'other' }),
]

// ---------- 现金流量 ----------

const MONTH_CASH_INFLOW: ReportRow[] = [
  group('cash-op-in', '经营', [
    leaf('cash-salary', '工资', 18000, { categoryId: 'salary', query: '工资' }),
    leaf('cash-reimburse', '报销', 180, { categoryId: 'reimburse', query: '报销' }),
  ]),
  group('cash-inv-in', '投资', [
    leaf('cash-invest-income', '理财收益', 312.4, { categoryId: 'invest', query: '理财' }),
  ]),
  group('cash-fin-in', '筹资', [
    leaf('cash-loan', '信用卡取现', 1000, { query: '取现' }),
  ]),
  group('cash-other-in', '未分类', [
    leaf('cash-refund', '退款', 68, { categoryId: 'refund', query: '退货' }),
  ]),
  group('cash-transfer-in', '账户间转账', [
    leaf('cash-transfer-in-alipay', '转入支付宝', 2000, { query: '转入支付宝' }),
  ]),
]

const MONTH_CASH_OUTFLOW: ReportRow[] = [
  group('cash-op-out', '经营', [
    leaf('cash-housing', '居住', -5840, { categoryId: 'home', query: '房租' }),
    leaf('cash-food', '餐饮', -814.6, { categoryId: 'food', query: '餐' }),
    leaf('cash-shopping', '购物', -260.6, { categoryId: 'shopping', query: '山姆' }),
    leaf('cash-transport', '交通', -151, { categoryId: 'transport' }),
    leaf('cash-fun', '娱乐', -79, { categoryId: 'fun' }),
    leaf('cash-health', '医疗', -120, { categoryId: 'health' }),
    leaf('cash-education', '教育', -199, { categoryId: 'education' }),
    leaf('cash-other', '其他', -54.7, { categoryId: 'other' }),
  ]),
  group('cash-inv-out', '投资', [
    leaf('cash-fund-purchase', '基金申购', -3000, { query: '基金' }),
  ]),
  group('cash-fin-out', '筹资', [
    leaf('cash-credit-repay', '信用卡还款', -3280.6, { query: '还款' }),
  ]),
  group('cash-other-out', '未分类', [
    leaf('cash-fee', '手续费', -12.5, { query: '手续费' }),
  ]),
  group('cash-transfer-out', '账户间转账', [
    leaf('cash-transfer-out-alipay', '转出至支付宝', -2000, { query: '转入支付宝' }),
  ]),
]

// ---------- 资产负债 ----------

const MONTH_ASSETS: ReportRow[] = [
  group('cash', '现金及等价物', [
    leaf('cmb-card', '招商银行储蓄卡（工资代发 · 尾号 8842）', 82340.5, { accountId: 'cmb' }),
    leaf('wechat-wallet', '微信零钱', 1286.4, { accountId: 'wx' }),
    leaf('alipay-wallet', '支付宝余额', 2412.8, { accountId: 'alipay' }),
    leaf('cash-on-hand', '现金', 320, { accountId: 'cash' }),
  ]),
  group('investment', '投资资产', [
    leaf('fund', '基金', 58600, { query: '基金' }),
    leaf('stock', '股票', 42350.6, { query: '股票' }),
  ]),
  leaf('receivable', '应收报销', 1200, { query: '报销' }),
]

const MONTH_LIABILITIES: ReportRow[] = [
  group('credit', '负债', [
    leaf('cmb-credit', '招行信用卡', 3280.6, { accountId: 'credit' }),
    leaf('huabei', '花呗', 1152, { query: '花呗' }),
  ]),
]

// ---------- 投资分析 ----------

const MONTH_HOLDINGS: ReportRow[] = [
  group('hold-fund', '基金', [
    holding('hold-hs300', '沪深300ETF', 22800, 21000),
    holding('hold-bond', '债券基金', 15800, 15000),
  ]),
  group('hold-stock', '股票', [
    holding('hold-moutai', '贵州茅台', 21650.6, 19000),
    holding('hold-catl', '宁德时代', 20700, 18000),
  ]),
  group('hold-cash', '现金类', [
    holding('hold-money-fund', '货币基金', 3200, 3200),
  ]),
]

const YEAR_INCOME: ReportRow[] = [
  group('salary-year', '工资', [
    leaf('salary-year-base', '基本工资', 204000, { query: '工资' }),
    leaf('salary-year-bonus', '奖金', 12000, { query: '奖金' }),
  ], { categoryId: 'salary' }),
  leaf('investment-year', '理财收益', 4286.4, { categoryId: 'invest', query: '理财' }),
  leaf('reimbursement-year', '报销', 1820, { categoryId: 'reimburse', query: '报销' }),
]

const YEAR_EXPENSE: ReportRow[] = [
  group('housing-year', '居住', [
    leaf('rent-year', '房租', -67200, { query: '房租' }),
    leaf('utilities-year', '水电燃气', -2880, { query: '水电' }),
  ], { categoryId: 'home' }),
  group('food-year', '餐饮', [
    leaf('canteen-year', '公司食堂', -1200, { query: '公司食堂' }),
    leaf('takeout-year', '外卖', -2412.6, { query: '外卖' }),
    leaf('dinner-year', '晚餐', -618.6, { query: '晚餐' }),
  ], { categoryId: 'food' }),
  group('shopping-year', '购物', [
    leaf('market-year', '山姆会员店', -3520, { query: '山姆' }),
    leaf('refund-year', '退货退款', 392.8, { query: '退货' }),
  ], { categoryId: 'shopping' }),
  leaf('transport-year', '交通', -1812, { categoryId: 'transport' }),
  leaf('entertainment-year', '娱乐', -948, { categoryId: 'fun' }),
  leaf('health-year', '医疗', -1440, { categoryId: 'health' }),
  leaf('education-year', '教育', -2388, { categoryId: 'education' }),
  leaf('other-year', '其他', -656.4, { categoryId: 'other' }),
]

const YEAR_ASSETS: ReportRow[] = [
  group('cash-year', '现金及等价物', [
    leaf('cmb-year', '招商银行储蓄卡（工资代发 · 尾号 8842）', 94300, { accountId: 'cmb' }),
    leaf('wechat-year', '微信零钱', 2180.4, { accountId: 'wx' }),
    leaf('alipay-year', '支付宝余额', 5999.8, { accountId: 'alipay' }),
    leaf('cash-year-hand', '现金', 1000, { accountId: 'cash' }),
  ]),
  group('investment-year-group', '投资资产', [
    leaf('fund-year', '基金', 68420.8, { query: '基金' }),
    leaf('stock-year', '股票', 50000, { query: '股票' }),
  ]),
  leaf('receivable-year', '应收报销', 2400, { query: '报销' }),
]

const YEAR_LIABILITIES: ReportRow[] = [
  group('credit-year', '负债', [
    leaf('cmb-credit-year', '招行信用卡', 4210.8, { accountId: 'credit' }),
    leaf('huabei-year', '花呗', 1000, { query: '花呗' }),
  ]),
]

const YEAR_CASH_INFLOW: ReportRow[] = [
  group('y-cash-op-in', '经营', [
    leaf('y-cash-salary', '工资', 216000, { categoryId: 'salary', query: '工资' }),
    leaf('y-cash-reimburse', '报销', 1820, { categoryId: 'reimburse', query: '报销' }),
  ]),
  group('y-cash-inv-in', '投资', [
    leaf('y-cash-invest', '理财收益', 4286.4, { categoryId: 'invest', query: '理财' }),
  ]),
  group('y-cash-fin-in', '筹资', [
    leaf('y-cash-loan', '信用卡取现', 12000, { query: '取现' }),
  ]),
  group('y-cash-other-in', '未分类', [
    leaf('y-cash-refund', '退款', 392.8, { categoryId: 'refund', query: '退货' }),
  ]),
  group('y-cash-transfer-in', '账户间转账', [
    leaf('y-cash-transfer', '账户互转', 24000, { query: '转入' }),
  ]),
]

const YEAR_CASH_OUTFLOW: ReportRow[] = [
  group('y-cash-op-out', '经营', [
    leaf('y-cash-housing', '居住', -70080, { categoryId: 'home', query: '房租' }),
    leaf('y-cash-food', '餐饮', -4231.2, { categoryId: 'food', query: '餐' }),
    leaf('y-cash-shopping', '购物', -3127.2, { categoryId: 'shopping', query: '山姆' }),
    leaf('y-cash-transport', '交通', -1812, { categoryId: 'transport' }),
    leaf('y-cash-fun', '娱乐', -948, { categoryId: 'fun' }),
    leaf('y-cash-health', '医疗', -1440, { categoryId: 'health' }),
    leaf('y-cash-education', '教育', -2388, { categoryId: 'education' }),
    leaf('y-cash-other', '其他', -656.4, { categoryId: 'other' }),
  ]),
  group('y-cash-inv-out', '投资', [
    leaf('y-cash-fund', '基金申购', -36000, { query: '基金' }),
  ]),
  group('y-cash-fin-out', '筹资', [
    leaf('y-cash-repay', '信用卡还款', -39000, { query: '还款' }),
  ]),
  group('y-cash-other-out', '未分类', [
    leaf('y-cash-fee', '手续费', -150, { query: '手续费' }),
  ]),
  group('y-cash-transfer-out', '账户间转账', [
    leaf('y-cash-transfer-out', '账户转出', -24000, { query: '转入' }),
  ]),
]

const MONTH_HOLDING_TABLE: ReportTableData = {
  id: 'holdings',
  title: '持仓明细',
  kind: 'investment',
  format: 'unsigned',
  tone: 'neutral',
  rows: MONTH_HOLDINGS,
  columns: [
    { key: 'main', label: '持仓', align: 'start', weight: 2.2, format: 'text', tone: 'neutral' },
    { key: 'marketValue', label: '市值', align: 'end', weight: 1.2, format: 'unsigned', tone: 'neutral', sortable: true },
    { key: 'cost', label: '成本', align: 'end', weight: 1.1, format: 'unsigned', tone: 'neutral', sortable: true },
    { key: 'gain', label: '收益', align: 'end', weight: 1, format: 'signed', tone: 'auto', sortable: true },
    { key: 'gainRate', label: '收益率', align: 'end', weight: 0.9, format: 'percent', tone: 'auto', sortable: true },
  ],
}

function flowsTables(incomeRows: ReportRow[], expenseRows: ReportRow[]): [ReportTableData, ReportTableData] {
  return [
    { id: 'income', title: '收入', kind: 'flows', format: 'signed', tone: 'income', rows: incomeRows },
    { id: 'expense', title: '支出', kind: 'flows', format: 'signed', tone: 'expense', rows: expenseRows },
  ]
}

function cashTables(inflowRows: ReportRow[], outflowRows: ReportRow[]): [ReportTableData, ReportTableData] {
  return [
    { id: 'inflow', title: '流入', kind: 'cash', format: 'signed', tone: 'income', rows: inflowRows },
    { id: 'outflow', title: '流出', kind: 'cash', format: 'signed', tone: 'expense', rows: outflowRows },
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
    { id: 'assets', title: '资产', kind: 'balance', format: 'unsigned', tone: 'neutral', rows: assetRows },
    {
      id: 'liabilities',
      title: '负债与权益',
      kind: 'balance',
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
      { label: '本期收入', value: formatAmount(income), tone: 'income' },
      { label: '本期支出', value: formatAmount(expense), tone: 'expense' },
      { label: '储蓄率', value: formatPercent(rate), tone: 'neutral', hint: '结余 / 收入' },
    ],
  }
}

function cashMetrics(inflowRows: ReportRow[], outflowRows: ReportRow[], cashTotal: number): ReportMetrics {
  const groupNet = (label: string) => {
    const inflow = inflowRows.find((row) => row.label === label)?.amount ?? 0
    const outflow = outflowRows.find((row) => row.label === label)?.amount ?? 0
    return round2(inflow + outflow)
  }

  const operating = groupNet('经营')
  const investing = groupNet('投资')
  const financing = groupNet('筹资')

  return {
    main: { label: '期末现金总量', value: formatUnsigned(cashTotal), tone: 'neutral' },
    cells: [
      { label: '经营净额', value: formatAmount(operating), tone: operating < 0 ? 'expense' : 'income' },
      { label: '投资净额', value: formatAmount(investing), tone: investing < 0 ? 'expense' : 'income' },
      { label: '筹资净额', value: formatAmount(financing), tone: financing < 0 ? 'expense' : 'income' },
    ],
  }
}

function balanceMetrics(assetRows: ReportRow[], liabilityRows: ReportRow[]): ReportMetrics {
  const assets = tableTotal(assetRows)
  const liabilities = tableTotal(liabilityRows)
  const netWorth = round2(assets - liabilities)

  return {
    main: { label: '净资产', value: formatUnsigned(netWorth), tone: 'neutral' },
    cells: [
      { label: '总资产', value: formatUnsigned(assets), tone: 'neutral' },
      { label: '总负债', value: formatUnsigned(liabilities), tone: 'neutral' },
      { label: '权益合计', value: formatUnsigned(netWorth), tone: 'neutral', hint: '负债与权益合计 = 总资产' },
    ],
  }
}

function investmentMetrics(rows: ReportRow[]): ReportMetrics {
  const marketValue = tableTotal(rows)
  const cost = round2(rows.reduce((sum, row) => sum + (row.values?.cost ?? 0), 0))
  const gain = round2(marketValue - cost)
  const rate = cost === 0 ? 0 : gain / cost
  const holdings = rows.reduce((count, row) => count + (row.children?.length ?? 1), 0)

  return {
    main: { label: '期末市值', value: formatUnsigned(marketValue), tone: 'neutral' },
    cells: [
      { label: '累计收益', value: formatAmount(gain), tone: gain < 0 ? 'expense' : 'income' },
      { label: '累计收益率', value: formatPercent(rate), tone: gain < 0 ? 'expense' : 'income' },
      { label: '持仓数', value: `${holdings} 项`, tone: 'neutral' },
    ],
  }
}

function monthPeriod(key: string, asOf: string, from: string, to: string, factor: number): ReportPeriod {
  const incomeRows = scaleRows(MONTH_INCOME, factor)
  const expenseRows = scaleRows(MONTH_EXPENSE, factor)
  const assetRows = scaleRows(MONTH_ASSETS, factor)
  const liabilityRows = scaleRows(MONTH_LIABILITIES, factor)
  const inflowRows = scaleRows(MONTH_CASH_INFLOW, factor)
  const outflowRows = scaleRows(MONTH_CASH_OUTFLOW, factor)
  const holdings = scaleRows(MONTH_HOLDINGS, factor)
  const net = round2(tableTotal(incomeRows) + tableTotal(expenseRows))
  const cashTotal = round2(tableTotal(scaleRows(MONTH_ASSETS[0].children ?? [], factor)))
  const netWorth = round2(tableTotal(assetRows) - tableTotal(liabilityRows))
  const holdingTotal = tableTotal(holdings)
  const balance = balanceTables(assetRows, liabilityRows, net)

  return {
    key,
    granularity: 'month',
    label: key,
    asOf,
    from,
    to,
    views: {
      flows: {
        metrics: flowsMetrics(incomeRows, expenseRows),
        tables: flowsTables(incomeRows, expenseRows),
        trend: trendEndingAt(net, TREND_RATIOS),
        trendLabel: '近 6 个月结余',
        composition: {
          primary: composition('收入构成', incomeRows, 'income', 'signed'),
          secondary: composition('支出构成', expenseRows, 'expense', 'signed'),
          mobileSide: 'secondary',
        },
      },
      cash: {
        metrics: cashMetrics(inflowRows, outflowRows, cashTotal),
        metricsLayout: 'flat',
        tables: cashTables(inflowRows, outflowRows),
        trend: trendEndingAt(cashTotal, TREND_RATIOS),
        trendLabel: '近 6 个月期末现金',
        composition: {
          primary: composition('流入构成', inflowRows, 'income', 'signed'),
          secondary: composition('流出构成', outflowRows, 'expense', 'signed'),
          mobileSide: 'secondary',
        },
      },
      balance: {
        metrics: balanceMetrics(assetRows, liabilityRows),
        tables: balance,
        trend: trendEndingAt(netWorth, TREND_RATIOS),
        trendLabel: '近 6 个月净资产',
        composition: {
          primary: composition('资产构成', assetRows, 'neutral', 'unsigned'),
          secondary: composition('负债与权益构成', balance[1].rows, 'neutral', 'unsigned'),
          mobileSide: 'secondary',
        },
      },
      investment: {
        metrics: investmentMetrics(holdings),
        tables: [{ ...MONTH_HOLDING_TABLE, rows: holdings }],
        trend: trendEndingAt(holdingTotal, TREND_RATIOS),
        trendLabel: '近 6 个月持仓市值',
        composition: {
          primary: composition('持仓构成', holdings, 'neutral', 'unsigned'),
          mobileSide: 'primary',
        },
      },
    },
  }
}

function yearPeriod(key: string, asOf: string, factor: number): ReportPeriod {
  const incomeRows = scaleRows(YEAR_INCOME, factor)
  const expenseRows = scaleRows(YEAR_EXPENSE, factor)
  const assetRows = scaleRows(YEAR_ASSETS, factor)
  const liabilityRows = scaleRows(YEAR_LIABILITIES, factor)
  const inflowRows = scaleRows(YEAR_CASH_INFLOW, factor)
  const outflowRows = scaleRows(YEAR_CASH_OUTFLOW, factor)
  const holdings = scaleRows(MONTH_HOLDINGS, factor * 1.2)
  const net = round2(tableTotal(incomeRows) + tableTotal(expenseRows))
  const cashTotal = round2(tableTotal(scaleRows(YEAR_ASSETS[0].children ?? [], factor)))
  const netWorth = round2(tableTotal(assetRows) - tableTotal(liabilityRows))
  const holdingTotal = tableTotal(holdings)
  const balance = balanceTables(assetRows, liabilityRows, net)

  return {
    key,
    granularity: 'year',
    label: key,
    asOf,
    from: `${key}-01-01`,
    to: `${key}-12-31`,
    views: {
      flows: {
        metrics: flowsMetrics(incomeRows, expenseRows),
        tables: flowsTables(incomeRows, expenseRows),
        trend: trendEndingAt(net, TREND_RATIOS),
        trendLabel: '近 6 个月结余',
        composition: {
          primary: composition('收入构成', incomeRows, 'income', 'signed'),
          secondary: composition('支出构成', expenseRows, 'expense', 'signed'),
          mobileSide: 'secondary',
        },
      },
      cash: {
        metrics: cashMetrics(inflowRows, outflowRows, cashTotal),
        metricsLayout: 'flat',
        tables: cashTables(inflowRows, outflowRows),
        trend: trendEndingAt(cashTotal, TREND_RATIOS),
        trendLabel: '近 6 个月期末现金',
        composition: {
          primary: composition('流入构成', inflowRows, 'income', 'signed'),
          secondary: composition('流出构成', outflowRows, 'expense', 'signed'),
          mobileSide: 'secondary',
        },
      },
      balance: {
        metrics: balanceMetrics(assetRows, liabilityRows),
        tables: balance,
        trend: trendEndingAt(netWorth, TREND_RATIOS),
        trendLabel: '近 6 个月净资产',
        composition: {
          primary: composition('资产构成', assetRows, 'neutral', 'unsigned'),
          secondary: composition('负债与权益构成', balance[1].rows, 'neutral', 'unsigned'),
          mobileSide: 'secondary',
        },
      },
      investment: {
        metrics: investmentMetrics(holdings),
        tables: [{ ...MONTH_HOLDING_TABLE, id: 'holdings-year', rows: holdings }],
        trend: trendEndingAt(holdingTotal, TREND_RATIOS),
        trendLabel: '近 6 个月持仓市值',
        composition: {
          primary: composition('持仓构成', holdings, 'neutral', 'unsigned'),
          mobileSide: 'primary',
        },
      },
    },
  }
}

/** 静态 mock：月 / 年各有一组可回退的期间，箭头到边界即禁用。 */
export const REPORT_PERIODS: Record<ReportGranularity, ReportPeriod[]> = {
  month: [
    monthPeriod('2026-09', '截至 2026-09-30', '2026-09-01', '2026-09-30', 0.9),
    monthPeriod('2026-10', '截至 2026-10-31', '2026-10-01', '2026-10-31', 0.94),
    monthPeriod('2026-11', '截至 2026-11-30', '2026-11-01', '2026-11-30', 1),
  ],
  year: [
    yearPeriod('2025', '截至 2025-12-31', 0.86),
    yearPeriod('2026', '截至 2026-12-31', 1),
  ],
}
