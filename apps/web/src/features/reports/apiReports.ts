/**
 * 报表页 API 数据接入层（HF 批次 4）
 *
 * 四个视图的口径全部来自后端报表端点，前端只做「接口字段 → 视图模型」的映射，
 * 不再用账本流水重算收支 / 现金流 / 投资口径：
 *   资产负债 ← GET /reports/balance-sheet + GET /analytics/asset-trend
 *   收支明细 ← GET /reports/income-expense（走势按聚合桶逐桶查询）
 *   现金流   ← GET /reports/cash-flow
 *   投资分析 ← GET /reports/investment-analysis
 *
 * 流水只在展示层补充「笔数 / 账户名」，不参与合计。
 */
import { useQuery } from '@tanstack/react-query'
import type {
  AssetProjectionResult,
  BalanceSheetReportData,
  CashFlowProjectionResult,
  CashFlowReportData,
  IncomeExpenseProjectionResult,
  IncomeExpenseReportData,
  InvestmentAnalysisReportData,
} from '@/services/api'
import type {
  CashFlowActivity,
  CashFlowActivityItem,
  InvestmentCategorySummary,
  ProjectionBalance,
  ProjectionCashActivity,
  ProjectionCategoryDetail,
  ProjectionSourceValue,
  ReportCategoryDetail,
} from '@contracts/types'
import { analyticsApi, reportApi, unwrapApiData } from '@/services/api'
import { accountKindLabel } from '@/features/overview/model'
import { formatPercent } from '@/utils/format'
import type { Ledger, LedgerTransaction } from '@/features/overview/model'
import {
  currency,
  signedCurrency,
  type BalanceReport,
  type BalanceRow,
  type CashChild,
  type CashGroup,
  type CashReport,
  type FlowReport,
  type FlowTreeNode,
  type InvestmentAllocation,
  type InvestmentHoldingGroup,
  type InvestmentReport,
  type MetricPrediction,
  type ReportMetric,
} from './reportsModel'
import type { ProjectionWindow } from './futureModel'
import { listBuckets, type Granularity } from './reportsTime'

export interface ApiReportResult<T> {
  data: T | null
  status: 'idle' | 'loading' | 'success' | 'error'
  error: Error | null
  refetch: () => void
}

function resultOf<T>(query: {
  data: T | undefined
  status: 'pending' | 'error' | 'success'
  error: Error | null
  refetch: () => unknown
}, enabled: boolean): ApiReportResult<T> {
  const status = !enabled
    ? 'idle'
    : query.status === 'pending'
      ? 'loading'
      : query.status
  return {
    data: query.data ?? null,
    status,
    error: query.error,
    refetch: () => {
      void query.refetch()
    },
  }
}

function inRange(transaction: { date: string }, from: string, to: string): boolean {
  return transaction.date >= from && transaction.date <= to
}

function expenseSide(transaction: LedgerTransaction): boolean {
  if (transaction.type === 'expense') return true
  if (transaction.type === 'refund') return transaction.relatedType !== 'income'
  return transaction.type === 'adjustment' && transaction.amount < 0
}

function incomeSide(transaction: LedgerTransaction): boolean {
  if (transaction.type === 'income') return true
  if (transaction.type === 'refund') return transaction.relatedType === 'income'
  return false
}

/** 分类及其所有后代：后端只给到一级 / 二级，笔数按子树累计。 */
function subtreeOf(ledger: Ledger, categoryId: string): string[] {
  const ids = [categoryId]
  for (let index = 0; index < ids.length; index += 1) {
    const current = ids[index]
    for (const category of ledger.categories) {
      if (category.parentId === current) ids.push(category.id)
    }
  }
  return ids
}

function flowCounts(
  ledger: Ledger,
  from: string,
  to: string,
  includeExcluded = false,
): {
  income: Map<string, number>
  expense: Map<string, number>
} {
  const income = new Map<string, number>()
  const expense = new Map<string, number>()
  const bump = (map: Map<string, number>, categoryId: string) => {
    for (const id of subtreeOf(ledger, categoryId)) {
      map.set(id, (map.get(id) ?? 0) + 1)
    }
  }
  for (const transaction of ledger.transactions) {
    if (!inRange(transaction, from, to)) continue
    // 笔数必须和金额同一口径：排除「不计收支」时，这类流水也不进分类树的笔数。
    if (!includeExcluded && transaction.excludeFromIncomeExpense) continue
    if (incomeSide(transaction)) bump(income, transaction.categoryId)
    if (expenseSide(transaction)) bump(expense, transaction.categoryId)
  }
  return { income, expense }
}

/** 后端 predicted 是「预测部分」；合计 = actual + predicted。 */
function predictedOf(value: { predicted?: number }): number {
  return Math.abs(value.predicted ?? 0)
}

function predictionOf(
  actual: number,
  predicted: number,
  direction: 'income' | 'expense' | 'net',
): MetricPrediction | undefined {
  if (predicted === 0) return undefined
  const textOf = (value: number) => {
    if (direction === 'income') return `+${currency(Math.abs(value))}`
    if (direction === 'expense') return `−${currency(Math.abs(value))}`
    return signedCurrency(value)
  }
  return {
    actual,
    predicted,
    direction,
    split: `实际 ${textOf(actual)} · 预测 ${textOf(predicted)}`,
  }
}

function treeOf(
  details: ReportCategoryDetail[],
  total: number,
  counts: Map<string, number>,
  displayIdOf: (realId: string) => string,
): FlowTreeNode[] {
  // 构成的金额是「该侧发生了多少」，不继承接口历史符号；负向支出按绝对值参与分类树，
  // 否则 actual < 0 会被 > 0 的过滤条件静默丢掉，出现「合计有金额、构成没有数据」。
  // predicted 是预测部分，与 actual 同向相加；行内只对含预测的行标「预测」。
  const amountOf = (detail: ReportCategoryDetail) => Math.abs(detail.actual) + predictedOf(detail)
  return details
    .filter((detail) => amountOf(detail) > 0)
    .map((detail) => ({
      // 行 id 与笔数、下钻同用展示 id：根分类可能被改写成种子 key，
      // 若这里保留后端真实 id，下钻会按真实 id 在账本里找不到分类，根分类恒为 0 笔。
      id: displayIdOf(detail.categoryId),
      name: detail.name,
      amount: amountOf(detail),
      predicted: predictedOf(detail),
      count: counts.get(displayIdOf(detail.categoryId)) ?? 0,
      share: total === 0 ? 0 : (amountOf(detail) / total) * 100,
      level: 0 as const,
      children: (detail.children ?? [])
        .filter((child: ReportCategoryDetail) => amountOf(child) > 0)
        .map((child: ReportCategoryDetail) => ({
          id: displayIdOf(child.categoryId),
          name: child.name,
          amount: amountOf(child),
          predicted: predictedOf(child),
          count: counts.get(displayIdOf(child.categoryId)) ?? 0,
          share: total === 0 ? 0 : (amountOf(child) / total) * 100,
          level: 1 as const,
          children: [],
        })),
    }))
    .sort((left, right) => right.amount - left.amount)
}

export function mapFlowReport(
  data: IncomeExpenseReportData,
  series: { label: string; income: number; expense: number }[],
  ledger: Ledger,
  from: string,
  to: string,
  includeExcluded = false,
): FlowReport {
  // 接口的 actual 保留历史符号（真实库存在负向支出）；收入 / 支出是「方向 + 金额」，
  // 方向由本层的前缀承担，金额只取绝对值，避免「−-¥28.00」。
  // 预测部分与合计同为后端字段，不做插值；合计 = actual + predicted。
  const incomeActual = Math.abs(data.income.actual)
  const incomePredicted = predictedOf(data.income)
  const income = incomeActual + incomePredicted
  const expenseActual = Math.abs(data.expense.actual)
  const expensePredicted = predictedOf(data.expense)
  const expense = expenseActual + expensePredicted
  const balanceActual = data.balance.actual
  const balancePredicted = data.balance.predicted ?? 0
  const balance = balanceActual + balancePredicted
  const savingsRate = income === 0 ? 0 : (balance / income) * 100
  const counts = flowCounts(ledger, from, to, includeExcluded)
  const displayIdOf = (realId: string) => ledger.ids?.categoryDisplay?.[realId] ?? realId
  const normalizedSeries = series.map((item) => ({
    label: item.label,
    income: Math.abs(item.income),
    expense: Math.abs(item.expense),
  }))
  return {
    income,
    expense,
    balance,
    savingsRate,
    incomeTrees: treeOf(data.incomeCategoryDetails, income, counts.income, displayIdOf),
    expenseTrees: treeOf(data.expenseCategoryDetails, expense, counts.expense, displayIdOf),
    series: normalizedSeries,
    includeExcluded,
    predictionNote: data.predictionNote,
    metrics: [
      {
        label: '本期结余',
        value: signedCurrency(balance),
        tone: balance >= 0 ? 'income' : 'expense',
        prediction: predictionOf(balanceActual, balancePredicted, 'net'),
      },
      {
        label: '本期收入',
        value: `+${currency(income)}`,
        tone: 'income',
        prediction: predictionOf(incomeActual, incomePredicted, 'income'),
      },
      {
        label: '本期支出',
        value: `−${currency(expense)}`,
        tone: 'expense',
        prediction: predictionOf(expenseActual, expensePredicted, 'expense'),
      },
      { label: '储蓄率', value: formatPercent(savingsRate, 1, false) },
    ],
  }
}

/** 资产负债：账户行来自 assetNodes / liabilityNodes，合计用后端 ReportValue。 */
export function mapBalanceReport(
  data: BalanceSheetReportData,
  trend: { label: string; netWorth: number }[],
  ledger: Ledger,
): BalanceReport {
  const cashAccountIds = new Set(
    ledger.accounts.filter((account) => account.kind === 'cash').map((account) => account.id),
  )
  // 统一账户覆盖规则：资产与负债都只列「余额 ≠ 0」的账户（负余额保留），
  // 0 元账户折叠成计数提示（后端仍返回全部账户，设置页能看到）。
  // 不再对资产侧做 `actual > 0` 过滤——那会吞掉负余额资产，造成报表只显示 3 行。
  // 未来时点后端同时给 predicted：行金额 = actual + predicted，预测部分单独记账供行内标注。
  const totalOf = (account: { actual: number; predicted?: number }) =>
    account.actual + (account.predicted ?? 0)
  const rowsOf = (nodes: BalanceSheetReportData['assetNodes']): BalanceRow[] =>
    nodes.flatMap((node) =>
      node.children
        .filter((account) => totalOf(account) !== 0)
        .map((account) => ({
          id: account.id,
          name: account.name,
          kind: node.name,
          amount: totalOf(account),
          predicted: predictedOf(account),
          categoryId: account.categoryId,
        })),
    ).sort((left, right) => right.amount - left.amount)

  const countZero = (nodes: BalanceSheetReportData['assetNodes']) =>
    nodes.reduce((sum, node) => sum + node.children.filter((account) => totalOf(account) === 0).length, 0)

  const assets = rowsOf(data.assetNodes)
  const liabilities = rowsOf(data.liabilityNodes)
  const assetActual = data.assets.actual
  const assetPredicted = data.assets.predicted ?? 0
  const assetTotal = assetActual + assetPredicted
  const liabilityActual = data.liabilities.actual
  const liabilityPredicted = data.liabilities.predicted ?? 0
  const liabilityTotal = liabilityActual + liabilityPredicted
  const netWorthActual = data.netWorth.actual
  const netWorthPredicted = data.netWorth.predicted ?? 0
  const netWorth = netWorthActual + netWorthPredicted

  const zeroAccountCount = countZero(data.assetNodes) + countZero(data.liabilityNodes)
  const positiveAssets = assets.filter((row) => row.amount > 0)
  const negativeAssets = assets.filter((row) => row.amount < 0)
  const positiveAssetTotal = positiveAssets.reduce((sum, row) => sum + row.amount, 0)
  const negativeAssetTotal = negativeAssets.reduce((sum, row) => sum + row.amount, 0)

  const kindTotals = new Map<string, number>()
  for (const row of positiveAssets) {
    kindTotals.set(row.kind, (kindTotals.get(row.kind) ?? 0) + row.amount)
  }
  const composition = [...kindTotals.entries()]
    .map(([kind, amount]) => ({
      id: kind,
      name: kind,
      amount,
      share: positiveAssetTotal === 0 ? 0 : (amount / positiveAssetTotal) * 100,
    }))
    .sort((left, right) => right.amount - left.amount)

  return {
    point: data.date,
    assets,
    liabilities,
    assetTotal,
    liabilityTotal,
    netWorth,
    zeroAccountCount,
    positiveAssetTotal,
    negativeAssetTotal,
    negativeAssetCount: negativeAssets.length,
    composition,
    trend: trend.map((item) => ({ month: item.label, value: item.netWorth })),
    predictionNote: data.predictionNote,
    metrics: [
      {
        label: '净资产',
        value: currency(netWorth),
        prediction: predictionOf(netWorthActual, netWorthPredicted, 'net'),
      },
      {
        label: '总资产',
        value: currency(assetTotal),
        prediction: predictionOf(assetActual, assetPredicted, 'net'),
      },
      {
        label: '总负债',
        value: currency(liabilityTotal),
        tone: liabilityTotal > 0 ? 'expense' : 'neutral',
        prediction: predictionOf(liabilityActual, liabilityPredicted, 'net'),
      },
      {
        label: '现金及等价物',
        value: currency(
          assets
            .filter((row) => cashAccountIds.has(row.id))
            .reduce((sum, row) => sum + row.amount, 0),
        ),
      },
    ],
  }
}

const ACTIVITY_LABELS: Record<keyof CashFlowReportData['byActivity'], string> = {
  operating: '经营',
  investing: '投资',
  financing: '筹资',
  uncategorized: '未分类',
}

/** 活动净值按正负拆成毛流入 / 毛流出：退款冲减流入时仍归入流出，避免出现负数分组。 */
function grossOf(activity: CashFlowActivity): { inflow: number; outflow: number; predicted: number } {
  const inflow = activity.inflow.actual + (activity.inflow.predicted ?? 0)
  const outflow = activity.outflow.actual + (activity.outflow.predicted ?? 0)
  return {
    // outflow 通常为负；若为正，说明该活动整体是净流入。
    inflow: Math.max(inflow, 0) + Math.max(outflow, 0),
    outflow: Math.max(-inflow, 0) + Math.max(-outflow, 0),
    predicted: predictedOf(activity.inflow) + predictedOf(activity.outflow),
  }
}

function activityGroup(
  activity: CashFlowActivity,
  key: string,
  direction: 'in' | 'out',
  total: number,
  ledger: Ledger,
  from: string,
  to: string,
): CashGroup | null {
  if (total <= 0) return null
  // actual / predicted 都已带符号（流入为正、流出为负），合计后按方向筛选；
  // 收入退款（direction=inflow、actual<0）因此归入流出，不会制造负数分组。
  const totalOfItem = (item: CashFlowActivityItem) => item.actual + (item.predicted ?? 0)
  const items = activity.items.filter((item) =>
    direction === 'in' ? totalOfItem(item) > 0 : totalOfItem(item) < 0,
  )
  const fromAccount = new Map(ledger.accounts.map((account) => [account.id, account.name]))
  const counted = new Set<string>()

  const children: CashChild[] = items.map((item: CashFlowActivityItem, index: number) => {
    const ids = new Set(item.categoryId ? subtreeOf(ledger, item.categoryId) : [])
    const accounts = new Set<string>()
    for (const transaction of ledger.transactions) {
      if (!inRange(transaction, from, to)) continue
      if (!ids.has(transaction.categoryId)) continue
      counted.add(transaction.id)
      const name =
        fromAccount.get(transaction.toAccountId ?? transaction.accountId) ??
        fromAccount.get(transaction.accountId)
      if (name) accounts.add(name)
    }
    return {
      id: `${key}-${direction}-${item.categoryId ?? item.categoryName}-${index}`,
      label: item.categoryName,
      account: accounts.size > 0 ? [...accounts].join(' / ') : '—',
      amount: Math.abs(totalOfItem(item)),
      predicted: predictedOf(item),
      tone:
        item.type.startsWith('transfer')
          ? ('transfer' as const)
          : direction === 'in'
            ? ('income' as const)
            : ('expense' as const),
      categoryId: item.categoryId ?? '',
    }
  })
  return {
    key,
    name: key,
    total,
    predicted: predictedOf(activity.inflow) + predictedOf(activity.outflow),
    count: counted.size,
    children: children.sort((left, right) => right.amount - left.amount),
  }
}

/** 现金流：分组、合计、期初 / 期末现金全部来自 /reports/cash-flow。 */
export function mapCashReport(data: CashFlowReportData, ledger: Ledger, from: string, to: string): CashReport {
  const activities: [keyof CashFlowReportData['byActivity'], CashFlowActivity][] = [
    ['operating', data.byActivity.operating],
    ['investing', data.byActivity.investing],
    ['financing', data.byActivity.financing],
    ['uncategorized', data.byActivity.uncategorized],
  ]
  const inflowGroups: CashGroup[] = []
  const outflowGroups: CashGroup[] = []
  let inflowGross = 0
  let outflowGross = 0
  for (const [key, activity] of activities) {
    const label = ACTIVITY_LABELS[key]
    const gross = grossOf(activity)
    inflowGross += gross.inflow
    outflowGross += gross.outflow
    const inflow = activityGroup(activity, label, 'in', gross.inflow, ledger, from, to)
    const outflow = activityGroup(activity, label, 'out', gross.outflow, ledger, from, to)
    if (inflow) inflowGroups.push(inflow)
    if (outflow) outflowGroups.push(outflow)
  }

  const operatingActual = data.byActivity.operating.net.actual
  const operatingPredicted = data.byActivity.operating.net.predicted ?? 0
  const operatingNet = operatingActual + operatingPredicted
  const investingActual = data.byActivity.investing.net.actual
  const investingPredicted = data.byActivity.investing.net.predicted ?? 0
  const investingNet = investingActual + investingPredicted
  const financingActual = data.byActivity.financing.net.actual
  const financingPredicted = data.byActivity.financing.net.predicted ?? 0
  const financingNet = financingActual + financingPredicted
  const closingActual = data.endCash.actual
  const closingPredicted = data.endCash.predicted ?? 0
  const closingCash = closingActual + closingPredicted
  const inflowTotal = data.cashInflow.actual + (data.cashInflow.predicted ?? 0)
  const outflowTotal = Math.abs(data.cashOutflow.actual) + predictedOf(data.cashOutflow)
  const openingCash = data.startCash.actual + (data.startCash.predicted ?? 0)

  return {
    period: { from, to },
    inflowGroups,
    outflowGroups,
    inflowTotal,
    outflowTotal,
    operatingNet,
    investingNet,
    financingNet,
    closingCash,
    /** 后端三层桑基：现金账户之间转账已由后端产出 cash → cash link。 */
    apiSankey: data.sankey,
    /** 后端口径的期初现金；桑基优先用它，避免再按全账户净额重算。 */
    openingCash,
    /** 后端分组已含对账修正与手续费，桑基不再二次补计。 */
    correctionsIncluded: true,
    inflowGross,
    outflowGross,
    predictionNote: data.predictionNote,
    reconcile: {
      flowIncome: inflowTotal,
      flowExpense: outflowTotal,
      flowBalance: operatingNet,
      adjustmentExpense: 0,
      transferFee: 0,
      difference: 0,
    },
    metrics: [
      {
        label: '期末现金总量',
        value: currency(closingCash),
        prediction: predictionOf(closingActual, closingPredicted, 'net'),
      },
      {
        label: '经营净额',
        value: signedCurrency(operatingNet),
        tone: operatingNet >= 0 ? 'income' : 'expense',
        prediction: predictionOf(operatingActual, operatingPredicted, 'net'),
      },
      {
        label: '投资净额',
        value: signedCurrency(investingNet),
        tone: investingNet >= 0 ? 'income' : 'expense',
        prediction: predictionOf(investingActual, investingPredicted, 'net'),
      },
      {
        label: '筹资净额',
        value: signedCurrency(financingNet),
        tone: financingNet >= 0 ? 'income' : 'expense',
        prediction: predictionOf(financingActual, financingPredicted, 'net'),
      },
    ],
  }
}

/**
 * 预测区间的构成说明：四个数字全部是后端字段，前端只拼文案。
 * planned 为 null（没有预算来源）时显示「—」，不用 0 冒充。
 */
function projectionSplitOf(
  actual: number,
  source: { actual: number; planned: number | null; committed: number; total: number },
  direction: MetricPrediction['direction'],
): MetricPrediction {
  const textOf = (value: number) => {
    if (direction === 'income') return `+${currency(Math.abs(value))}`
    if (direction === 'expense') return `−${currency(Math.abs(value))}`
    return signedCurrency(value)
  }
  const planned = source.planned === null ? '—' : textOf(source.planned)
  return {
    actual,
    direction,
    split: `已发生 ${textOf(actual)} · 按预算计划 ${planned} · 已排定 ${textOf(source.committed)} · 合计 ${textOf(source.total)}`,
  }
}

/** 预测分类树：金额取 total，预测部分 = total − actual；无预算来源的行显式标注。 */
function projectionTreeOf(
  details: ProjectionCategoryDetail[],
  total: number,
  counts: Map<string, number>,
  displayIdOf: (realId: string) => string,
): FlowTreeNode[] {
  const amountOf = (detail: ProjectionCategoryDetail) => Math.abs(detail.total)
  const predictedOf = (detail: ProjectionCategoryDetail) =>
    Math.max(0, amountOf(detail) - Math.abs(detail.actual))
  const shareOf = (detail: ProjectionCategoryDetail) =>
    total === 0 ? 0 : (amountOf(detail) / total) * 100
  const childOf = (detail: ProjectionCategoryDetail): FlowTreeNode => ({
    id: displayIdOf(detail.categoryId),
    name: detail.name,
    amount: amountOf(detail),
    predicted: predictedOf(detail),
    // 后端 hasBudget=false：该分类（含子树）没有任何预算来源。
    noBudget: !detail.hasBudget ? true : undefined,
    count: counts.get(displayIdOf(detail.categoryId)) ?? 0,
    share: shareOf(detail),
    level: 1,
    children: [],
  })
  return details
    .filter((detail) => amountOf(detail) > 0)
    .map((detail) => ({
      id: displayIdOf(detail.categoryId),
      name: detail.name,
      amount: amountOf(detail),
      predicted: predictedOf(detail),
      noBudget: !detail.hasBudget ? true : undefined,
      count: counts.get(displayIdOf(detail.categoryId)) ?? 0,
      share: shareOf(detail),
      level: 0 as const,
      children: (detail.children ?? [])
        .filter((child) => amountOf(child) > 0)
        .map(childOf),
    }))
    .sort((left, right) => right.amount - left.amount)
}

const PROJECTION_BALANCE_NOTE =
  '预测区间：已发生 + 按预算计划 + 已排定 = 合计；投资账户只按买卖（转账）排期推演，不含市值涨跌。'

/** 资产负债预测：账户明细来自 asset-projection 的账户层，投资账户保留买卖排期说明。 */
export function mapProjectionBalanceReport(
  projection: AssetProjectionResult,
  ledger: Ledger,
): BalanceReport {
  const last = projection.points[projection.points.length - 1]
  const accounts = last?.accounts ?? []
  const kindOfAccount = new Map(ledger.accounts.map((account) => [account.id, accountKindLabel(account.kind)]))
  const cashAccountIds = new Set(
    ledger.accounts.filter((account) => account.kind === 'cash').map((account) => account.id),
  )
  const rowsOf = (type: 'asset' | 'liability') =>
    accounts
      .filter((account) => account.type === type && account.total !== 0)
      .map((account) => ({
        id: account.accountId,
        name: account.name,
        kind: kindOfAccount.get(account.accountId) ?? (type === 'asset' ? '资产' : '负债'),
        amount: account.total,
        predicted: Math.max(0, Math.abs(account.total) - Math.abs(account.actual)),
        categoryId: account.categoryId,
      }))
      .sort((left, right) => right.amount - left.amount)
  const assets = rowsOf('asset')
  const liabilities = rowsOf('liability')
  const assetTotal = last?.total.assets ?? projection.base.assets
  const liabilityTotal = last?.total.liabilities ?? projection.base.liabilities
  const netWorth = last?.total.netWorth ?? projection.base.netWorth
  const zeroAccountCount = accounts.filter((account) => account.total === 0).length
  const positiveAssets = assets.filter((row) => row.amount > 0)
  const negativeAssets = assets.filter((row) => row.amount < 0)
  const positiveAssetTotal = positiveAssets.reduce((sum, row) => sum + row.amount, 0)
  const negativeAssetTotal = negativeAssets.reduce((sum, row) => sum + row.amount, 0)

  const kindTotals = new Map<string, number>()
  for (const row of positiveAssets) {
    kindTotals.set(row.kind, (kindTotals.get(row.kind) ?? 0) + row.amount)
  }
  const composition = [...kindTotals.entries()]
    .map(([kind, amount]) => ({
      id: kind,
      name: kind,
      amount,
      share: positiveAssetTotal === 0 ? 0 : (amount / positiveAssetTotal) * 100,
    }))
    .sort((left, right) => right.amount - left.amount)

  const metric = (
    label: string,
    value: number,
    actual: number,
    planned: number,
    committed: number,
    total: number,
    tone: 'income' | 'expense' | 'neutral' = 'neutral',
  ): ReportMetric => ({
    label,
    value: currency(value),
    tone,
    prediction:
      total === actual
        ? undefined
        : projectionSplitOf(actual, { actual, planned, committed, total }, 'net'),
  })
  const metricOf = (
    label: string,
    value: number,
    pick: (balance: ProjectionBalance) => number,
    tone: 'income' | 'expense' | 'neutral' = 'neutral',
  ): ReportMetric =>
    last
      ? metric(
          label,
          value,
          pick(last.actual),
          pick(last.planned),
          pick(last.committed),
          pick(last.total),
          tone,
        )
      : { label, value: currency(value) }
  const cashTotal = accounts
    .filter((account) => account.type === 'asset' && cashAccountIds.has(account.accountId))
    .reduce((sum, account) => sum + account.total, 0)

  return {
    point: last?.date ?? projection.end,
    assets,
    liabilities,
    assetTotal,
    liabilityTotal,
    netWorth,
    zeroAccountCount,
    positiveAssetTotal,
    negativeAssetTotal,
    negativeAssetCount: negativeAssets.length,
    composition,
    trend: projection.points.map((point) => ({ month: point.label, value: point.total.netWorth })),
    predictionNote: last && last.end > projection.asOf ? PROJECTION_BALANCE_NOTE : undefined,
    metrics: [
      metricOf('净资产', netWorth, (balance) => balance.netWorth),
      metricOf('总资产', assetTotal, (balance) => balance.assets),
      metricOf('总负债', liabilityTotal, (balance) => balance.liabilities, liabilityTotal > 0 ? 'expense' : 'neutral'),
      { label: '现金及等价物', value: currency(cashTotal) },
    ],
  }
}

/** 收支预测：分类明细、逐桶走势与三来源合计全部来自 income-expense-projection。 */
export function mapProjectionFlowReport(
  data: IncomeExpenseProjectionResult,
  ledger: Ledger,
  from: string,
  to: string,
  includeExcluded = false,
): FlowReport {
  const income = Math.abs(data.income.total)
  const expense = Math.abs(data.expense.total)
  const balance = data.balance.total
  const savingsRate = income === 0 ? 0 : (balance / income) * 100
  const counts = flowCounts(ledger, from, to, includeExcluded)
  const displayIdOf = (realId: string) => ledger.ids?.categoryDisplay?.[realId] ?? realId
  const metric = (
    label: string,
    value: string,
    source: ProjectionSourceValue,
    direction: MetricPrediction['direction'],
    tone?: ReportMetric['tone'],
  ): ReportMetric => ({
    label,
    value,
    tone,
    prediction: source.total === source.actual ? undefined : projectionSplitOf(source.actual, source, direction),
  })

  return {
    income,
    expense,
    balance,
    savingsRate,
    incomeTrees: projectionTreeOf(data.incomeCategoryDetails, income, counts.income, displayIdOf),
    expenseTrees: projectionTreeOf(data.expenseCategoryDetails, expense, counts.expense, displayIdOf),
    series: data.points.map((point) => ({
      label: point.label,
      income: Math.abs(point.income.total),
      expense: Math.abs(point.expense.total),
    })),
    includeExcluded,
    predictionNote: data.predictionNote,
    metrics: [
      metric('本期结余', signedCurrency(balance), data.balance, 'net', balance >= 0 ? 'income' : 'expense'),
      metric('本期收入', `+${currency(income)}`, data.income, 'income', 'income'),
      metric('本期支出', `−${currency(expense)}`, data.expense, 'expense', 'expense'),
      { label: '储蓄率', value: formatPercent(savingsRate, 1, false) },
    ],
  }
}

function projectionCashGroup(
  activity: ProjectionCashActivity,
  key: string,
  direction: 'in' | 'out',
): CashGroup | null {
  const source = direction === 'in' ? activity.inflow : activity.outflow
  const total = Math.abs(source.total)
  if (total <= 0) return null
  // item 金额保留既有符号：流入为正、流出为负；按方向筛选后再统一取正数展示。
  const items = activity.items.filter((item) => (direction === 'in' ? item.total > 0 : item.total < 0))
  const children: CashChild[] = items
    .map((item, index) => {
      const amount = Math.abs(item.total)
      const sources = [
        item.actual !== 0 ? '已发生' : null,
        item.committed !== 0 ? '已排定' : null,
        (item.planned ?? 0) !== 0 ? '预算计划' : null,
      ].filter(Boolean)
      return {
        id: `${key}-${direction}-${item.categoryId ?? item.categoryName}-${index}`,
        label: item.categoryName,
        account: sources.length > 0 ? sources.join(' · ') : '—',
        amount,
        predicted: Math.max(0, amount - Math.abs(item.actual)),
        tone:
          item.type.startsWith('transfer')
            ? ('transfer' as const)
            : direction === 'in'
              ? ('income' as const)
              : ('expense' as const),
        categoryId: item.categoryId ?? '',
      }
    })
    .sort((left, right) => right.amount - left.amount)
  return {
    key,
    name: key,
    total,
    predicted: Math.max(0, total - Math.abs(source.actual)),
    meta: `${children.length} 个分类`,
    count: children.length,
    children,
  }
}

/** 现金流预测：活动分组、三来源与窗口级桑基全部来自 cash-flow-projection。 */
export function mapProjectionCashReport(
  data: CashFlowProjectionResult,
  from: string,
  to: string,
): CashReport {
  const activities: [keyof CashFlowProjectionResult['byActivity'], ProjectionCashActivity][] = [
    ['operating', data.byActivity.operating],
    ['investing', data.byActivity.investing],
    ['financing', data.byActivity.financing],
    ['uncategorized', data.byActivity.uncategorized],
  ]
  const inflowGroups: CashGroup[] = []
  const outflowGroups: CashGroup[] = []
  for (const [key, activity] of activities) {
    const label = ACTIVITY_LABELS[key]
    const inflow = projectionCashGroup(activity, label, 'in')
    const outflow = projectionCashGroup(activity, label, 'out')
    if (inflow) inflowGroups.push(inflow)
    if (outflow) outflowGroups.push(outflow)
  }

  const metric = (
    label: string,
    value: string,
    source: ProjectionSourceValue,
    direction: MetricPrediction['direction'],
    tone?: ReportMetric['tone'],
  ): ReportMetric => ({
    label,
    value,
    tone,
    prediction: source.total === source.actual ? undefined : projectionSplitOf(source.actual, source, direction),
  })
  return {
    period: { from, to },
    inflowGroups,
    outflowGroups,
    inflowTotal: Math.abs(data.cashInflow.total),
    outflowTotal: Math.abs(data.cashOutflow.total),
    operatingNet: data.byActivity.operating.net.total,
    investingNet: data.byActivity.investing.net.total,
    financingNet: data.byActivity.financing.net.total,
    closingCash: data.endCash,
    openingCash: data.startCash,
    apiSankey: data.sankey,
    projectionMode: true,
    correctionsIncluded: true,
    inflowGross: Math.abs(data.cashInflow.total),
    outflowGross: Math.abs(data.cashOutflow.total),
    predictionNote: data.predictionNote,
    reconcile: {
      flowIncome: Math.abs(data.cashInflow.total),
      flowExpense: Math.abs(data.cashOutflow.total),
      flowBalance: data.netCashFlow.total,
      adjustmentExpense: 0,
      transferFee: 0,
      difference: 0,
    },
    metrics: [
      { label: '期末现金总量', value: currency(data.endCash) },
      metric(
        '经营净额',
        signedCurrency(data.byActivity.operating.net.total),
        data.byActivity.operating.net,
        'net',
        data.byActivity.operating.net.total >= 0 ? 'income' : 'expense',
      ),
      metric(
        '投资净额',
        signedCurrency(data.byActivity.investing.net.total),
        data.byActivity.investing.net,
        'net',
        data.byActivity.investing.net.total >= 0 ? 'income' : 'expense',
      ),
      metric(
        '筹资净额',
        signedCurrency(data.byActivity.financing.net.total),
        data.byActivity.financing.net,
        'net',
        data.byActivity.financing.net.total >= 0 ? 'income' : 'expense',
      ),
    ],
  }
}

function allocationFromCategories(byCategory: InvestmentCategorySummary[]): InvestmentAllocation[] {
  return byCategory.map((category) => ({
    id: category.categoryId,
    name: category.categoryName,
    current: category.balance,
    ratio: category.ratio,
    target: category.ratio,
    deviation: 0,
    rebalance: 0,
  }))
}

/** 投资分析：汇总 / 收益 / 分布 / 持仓全部来自 /reports/investment-analysis。 */
export function mapInvestmentReport(
  data: InvestmentAnalysisReportData | null,
): InvestmentReport | null {
  if (!data) return null
  const holdings: InvestmentHoldingGroup[] = data.byAccountAllocation.map((account) => {
    const marketValue = account.items.reduce((sum, item) => sum + item.marketValue, 0)
    const gain = account.items.reduce((sum, item) => sum + (item.periodReturn ?? 0), 0)
    const children = account.items.map((item) => ({
      id: `${account.accountId}-${item.assetClassId}`,
      name: item.name,
      marketValue: item.marketValue,
      cost: item.marketValue - (item.periodReturn ?? 0),
      gain: item.periodReturn ?? 0,
      rate: item.returnRate ?? 0,
    }))
    return {
      id: account.accountId,
      name: account.accountName,
      marketValue: marketValue > 0 ? marketValue : account.balance,
      cost: (marketValue > 0 ? marketValue : account.balance) - gain,
      gain,
      rate: account.returnRate ?? 0,
      children,
    }
  })

  // 资产类型分布按账户内的资产分类加权：市值之和 / 目标比例取市值加权。
  const buckets = new Map<string, { name: string; current: number; weightedTarget: number; weight: number; rebalance: number }>()
  for (const account of data.byAccountAllocation) {
    for (const item of account.items) {
      const bucket = buckets.get(item.assetClassId) ?? {
        name: item.name,
        current: 0,
        weightedTarget: 0,
        weight: 0,
        rebalance: 0,
      }
      bucket.current += item.marketValue
      if (item.targetRatio !== null) {
        bucket.weightedTarget += item.targetRatio * item.marketValue
        bucket.weight += item.marketValue
      }
      bucket.rebalance += item.rebalanceAmount ?? 0
      buckets.set(item.assetClassId, bucket)
    }
  }
  const total = data.totalInvestment
  const allocation: InvestmentAllocation[] =
    buckets.size > 0
      ? [...buckets.entries()].map(([id, bucket]) => {
          const target = bucket.weight > 0 ? bucket.weightedTarget / bucket.weight : bucket.current / (total || 1) * 100
          const ratio = total === 0 ? 0 : (bucket.current / total) * 100
          return {
            id,
            name: bucket.name,
            current: bucket.current,
            ratio,
            target,
            deviation: ratio - target,
            rebalance: bucket.rebalance,
          }
        })
      : allocationFromCategories(data.byCategory)

  const costTotal = holdings.reduce((sum, holding) => sum + holding.cost, 0)
  const gainTotal = holdings.reduce((sum, holding) => sum + holding.gain, 0)
  const cumulativeReturn = data.returnAnalysis.cumulativeReturnRate
  const xirrRate = data.returnAnalysis.xirr
  const twr = data.returnAnalysis.twr

  return {
    total,
    allocation: allocation.sort((left, right) => right.current - left.current),
    snapshots: [],
    holdings: holdings.sort((left, right) => right.marketValue - left.marketValue),
    costTotal,
    gainTotal,
    cumulativeReturn,
    xirr: xirrRate,
    twr,
    metrics: [
      { label: '投资总市值', value: currency(total) },
      {
        label: '累计收益率',
        value: formatPercent(cumulativeReturn, 2),
        tone: cumulativeReturn >= 0 ? 'income' : 'expense',
      },
      { label: 'XIRR', value: xirrRate === null ? '—' : formatPercent(xirrRate, 2) },
      { label: 'TWR', value: twr === null ? '—' : formatPercent(twr, 2) },
    ],
    trend: data.trend.map((item) => ({ month: item.month, value: item.investment })),
  }
}

export function useApiBalanceReport(point: string, ledger: Ledger, enabled: boolean): ApiReportResult<BalanceReport> {
  const query = useQuery({
    queryKey: ['hf', 'report', 'balance', point],
    enabled,
    queryFn: async () => {
      const [sheet, trend] = await Promise.all([
        reportApi.getBalanceSheet(point).then(unwrapApiData),
        analyticsApi.getAssetTrend().then(unwrapApiData),
      ])
      return mapBalanceReport(sheet, trend, ledger)
    },
  })
  return resultOf(query, enabled)
}

/**
 * 资产负债未来推演：窗口参数只决定输出桶范围，累计起点仍是后端 asOf。
 * 取末桶的账户 / 分类明细，映射回同一套 BalanceReport 供既有视图渲染。
 */
export function useApiAssetProjection(
  window: ProjectionWindow,
  ledger: Ledger,
  enabled: boolean,
): ApiReportResult<BalanceReport> {
  const query = useQuery({
    queryKey: [
      'hf',
      'report',
      'asset-projection',
      window.asOf,
      window.granularity,
      window.from,
      window.to,
    ],
    enabled,
    queryFn: async () =>
      mapProjectionBalanceReport(await analyticsApi.getAssetProjection(window).then(unwrapApiData), ledger),
  })
  return resultOf(query, enabled)
}

/**
 * 现金流未来推演：活动分组、三来源与窗口级桑基由后端合成；
 * 与历史 `useApiCashReport` 互斥启用，同一区间只发一次请求。
 */
export function useApiCashProjection(
  window: ProjectionWindow,
  enabled: boolean,
): ApiReportResult<CashReport> {
  const query = useQuery({
    queryKey: [
      'hf',
      'report',
      'cash-projection',
      window.asOf,
      window.granularity,
      window.from,
      window.to,
    ],
    enabled,
    queryFn: async () => {
      const data = await reportApi.getCashFlowProjection(window).then(unwrapApiData)
      return mapProjectionCashReport(data, window.from, window.to)
    },
  })
  return resultOf(query, enabled)
}

/**
 * 收支未来明细：与现金流投影同一套 from/to + granularity 窗口。
 * 分类明细与三来源由后端合成，前端只映射回既有 FlowReport。
 */
export function useApiIncomeExpenseProjection(
  window: ProjectionWindow,
  ledger: Ledger,
  includeExcluded: boolean,
  enabled: boolean,
): ApiReportResult<FlowReport> {
  const query = useQuery({
    queryKey: [
      'hf',
      'report',
      'income-expense-projection',
      window.asOf,
      window.granularity,
      window.from,
      window.to,
      includeExcluded,
    ],
    enabled,
    queryFn: async () => {
      const data = await reportApi
        .getIncomeExpenseProjection(window, includeExcluded)
        .then(unwrapApiData)
      return mapProjectionFlowReport(data, ledger, window.from, window.to, includeExcluded)
    },
  })
  return resultOf(query, enabled)
}

export function useApiFlowReport(
  from: string,
  to: string,
  gran: Granularity,
  ledger: Ledger,
  includeExcluded: boolean,
  enabled: boolean,
): ApiReportResult<FlowReport> {
  const query = useQuery({
    queryKey: ['hf', 'report', 'flow', from, to, gran, includeExcluded],
    enabled,
    queryFn: async () => {
      const buckets = listBuckets(from, to, gran)
      const rangeOf = (bucket: { from: string; to: string }) => ({
        startDate: bucket.from < from ? from : bucket.from,
        endDate: bucket.to > to ? to : bucket.to,
      })
      // includePredictions 常开：未来期间由后端给 predicted；今天以前自然为 0。
      // includeExcluded 与开关同值，主区间和逐桶序列用同一口径，避免柱状图与合计不一致。
      const [main, series] = await Promise.all([
        reportApi.getIncomeExpense(from, to, true, includeExcluded).then(unwrapApiData),
        Promise.all(
          buckets.map((bucket) => {
            const range = rangeOf(bucket)
            return reportApi
              .getIncomeExpense(range.startDate, range.endDate, true, includeExcluded)
              .then(unwrapApiData)
              .then((data) => ({ label: bucket.label, income: data.income.actual, expense: data.expense.actual }))
          }),
        ),
      ])
      return mapFlowReport(main, series, ledger, from, to, includeExcluded)
    },
  })
  return resultOf(query, enabled)
}

export function useApiCashReport(from: string, to: string, ledger: Ledger, enabled: boolean): ApiReportResult<CashReport> {
  const query = useQuery({
    queryKey: ['hf', 'report', 'cash', from, to],
    enabled,
    queryFn: async () => {
      // 与旧版一致：现金流常带 includePredictions，未来期间的期末现金直接取后端预测。
      const data = await reportApi.getCashFlow(from, to, true).then(unwrapApiData)
      return mapCashReport(data, ledger, from, to)
    },
  })
  return resultOf(query, enabled)
}

export function useApiInvestReport(
  from: string,
  to: string,
  enabled: boolean,
): ApiReportResult<InvestmentReport | null> {
  const query = useQuery({
    queryKey: ['hf', 'report', 'invest', from, to],
    enabled,
    queryFn: async () => {
      const data = await reportApi.getInvestmentAnalysis(from, to)
      return mapInvestmentReport(unwrapApiData(data))
    },
  })
  return resultOf(query, enabled)
}
