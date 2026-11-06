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
  BalanceSheetReportData,
  CashFlowReportData,
  IncomeExpenseReportData,
  InvestmentAnalysisReportData,
} from '@/services/api'
import type {
  CashFlowActivity,
  CashFlowActivityItem,
  InvestmentCategorySummary,
  ReportCategoryDetail,
} from '@contracts/types'
import { analyticsApi, reportApi, unwrapApiData } from '@/services/api'
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
} from './reportsModel'
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

function flowCounts(ledger: Ledger, from: string, to: string): {
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
    if (incomeSide(transaction)) bump(income, transaction.categoryId)
    if (expenseSide(transaction)) bump(expense, transaction.categoryId)
  }
  return { income, expense }
}

function treeOf(
  details: ReportCategoryDetail[],
  total: number,
  counts: Map<string, number>,
  displayIdOf: (realId: string) => string,
): FlowTreeNode[] {
  // 构成的金额是「该侧发生了多少」，不继承接口历史符号；负向支出按绝对值参与分类树，
  // 否则 actual < 0 会被 > 0 的过滤条件静默丢掉，出现「合计有金额、构成没有数据」。
  const amountOf = (detail: ReportCategoryDetail) => Math.abs(detail.actual)
  return details
    .filter((detail) => amountOf(detail) > 0)
    .map((detail) => ({
      id: detail.categoryId,
      name: detail.name,
      amount: amountOf(detail),
      // 接口分类是后端真实 id，账本流水按展示 id 归集；笔数必须同一 id 空间才能对上。
      count: counts.get(displayIdOf(detail.categoryId)) ?? 0,
      share: total === 0 ? 0 : (amountOf(detail) / total) * 100,
      level: 0 as const,
      children: (detail.children ?? [])
        .filter((child: ReportCategoryDetail) => amountOf(child) > 0)
        .map((child: ReportCategoryDetail) => ({
          id: child.categoryId,
          name: child.name,
          amount: amountOf(child),
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
): FlowReport {
  // 接口的 actual 保留历史符号（真实库存在负向支出）；收入 / 支出是「方向 + 金额」，
  // 方向由本层的前缀承担，金额只取绝对值，避免「−-¥28.00」。
  const income = Math.abs(data.income.actual)
  const expense = Math.abs(data.expense.actual)
  const balance = data.balance.actual
  const savingsRate = income === 0 ? 0 : (balance / income) * 100
  const counts = flowCounts(ledger, from, to)
  const displayIdOf = (realId: string) => ledger.ids?.categoryDisplay?.[realId] ?? realId
  return {
    income,
    expense,
    balance,
    savingsRate,
    incomeTrees: treeOf(data.incomeCategoryDetails, income, counts.income, displayIdOf),
    expenseTrees: treeOf(data.expenseCategoryDetails, expense, counts.expense, displayIdOf),
    series,
    metrics: [
      {
        label: '本期结余',
        value: signedCurrency(balance),
        tone: balance >= 0 ? 'income' : 'expense',
      },
      { label: '本期收入', value: `+${currency(income)}`, tone: 'income' },
      { label: '本期支出', value: `−${currency(expense)}`, tone: 'expense' },
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
  const rowsOf = (nodes: BalanceSheetReportData['assetNodes']): BalanceRow[] =>
    nodes.flatMap((node) =>
      node.children
        .filter((account) => account.actual > 0)
        .map((account) => ({
          id: account.id,
          name: account.name,
          kind: node.name,
          amount: account.actual,
        })),
    ).sort((left, right) => right.amount - left.amount)

  const assets = rowsOf(data.assetNodes)
  const liabilities = rowsOf(data.liabilityNodes)
  const assetTotal = data.assets.actual
  const liabilityTotal = data.liabilities.actual
  const netWorth = data.netWorth.actual

  const kindTotals = new Map<string, number>()
  for (const row of assets) {
    kindTotals.set(row.kind, (kindTotals.get(row.kind) ?? 0) + row.amount)
  }
  const composition = [...kindTotals.entries()]
    .map(([kind, amount]) => ({
      id: kind,
      name: kind,
      amount,
      share: assetTotal === 0 ? 0 : (amount / assetTotal) * 100,
    }))
    .sort((left, right) => right.amount - left.amount)

  return {
    point: data.date,
    assets,
    liabilities,
    assetTotal,
    liabilityTotal,
    netWorth,
    equity: netWorth,
    equityTotal: liabilityTotal + netWorth,
    composition,
    trend: trend.map((item) => ({ month: item.label, value: item.netWorth })),
    metrics: [
      { label: '净资产', value: currency(netWorth) },
      { label: '总资产', value: currency(assetTotal) },
      { label: '总负债', value: currency(liabilityTotal), tone: liabilityTotal > 0 ? 'expense' : 'neutral' },
      {
        label: '流动资产',
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
function grossOf(activity: CashFlowActivity): { inflow: number; outflow: number } {
  const inflowActual = activity.inflow.actual
  const outflowActual = activity.outflow.actual
  return {
    // outflowActual 通常为负；若为正，说明该活动整体是净流入。
    inflow: Math.max(inflowActual, 0) + Math.max(outflowActual, 0),
    outflow: Math.max(-inflowActual, 0) + Math.max(-outflowActual, 0),
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
  // actual 已带符号（流入为正、流出为负），与 grossOf 的拆法一致；
  // 收入退款（direction=inflow、actual<0）因此归入流出，不会制造负数分组。
  const items = activity.items.filter((item) =>
    direction === 'in' ? item.actual > 0 : item.actual < 0,
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
      amount: Math.abs(item.actual),
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

  const operatingNet = data.byActivity.operating.net.actual
  const investingNet = data.byActivity.investing.net.actual
  const financingNet = data.byActivity.financing.net.actual
  const closingCash = data.endCash.actual

  return {
    period: { from, to },
    inflowGroups,
    outflowGroups,
    inflowTotal: data.cashInflow.actual,
    outflowTotal: Math.abs(data.cashOutflow.actual),
    operatingNet,
    investingNet,
    financingNet,
    closingCash,
    /** 后端三层桑基：现金账户之间转账已由后端产出 cash → cash link。 */
    apiSankey: data.sankey,
    /** 后端口径的期初现金；桑基优先用它，避免再按全账户净额重算。 */
    openingCash: data.startCash.actual,
    /** 后端分组已含对账修正与手续费，桑基不再二次补计。 */
    correctionsIncluded: true,
    inflowGross,
    outflowGross,
    reconcile: {
      flowIncome: data.cashInflow.actual,
      flowExpense: Math.abs(data.cashOutflow.actual),
      flowBalance: operatingNet,
      adjustmentExpense: 0,
      transferFee: 0,
      difference: 0,
    },
    metrics: [
      { label: '期末现金总量', value: currency(closingCash) },
      {
        label: '经营净额',
        value: signedCurrency(operatingNet),
        tone: operatingNet >= 0 ? 'income' : 'expense',
      },
      { label: '投资净额', value: signedCurrency(investingNet), tone: investingNet >= 0 ? 'income' : 'expense' },
      { label: '筹资净额', value: signedCurrency(financingNet), tone: financingNet >= 0 ? 'income' : 'expense' },
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

export function useApiFlowReport(
  from: string,
  to: string,
  gran: Granularity,
  ledger: Ledger,
  enabled: boolean,
): ApiReportResult<FlowReport> {
  const query = useQuery({
    queryKey: ['hf', 'report', 'flow', from, to, gran],
    enabled,
    queryFn: async () => {
      const buckets = listBuckets(from, to, gran)
      const rangeOf = (bucket: { from: string; to: string }) => ({
        startDate: bucket.from < from ? from : bucket.from,
        endDate: bucket.to > to ? to : bucket.to,
      })
      const [main, series] = await Promise.all([
        reportApi.getIncomeExpense(from, to).then(unwrapApiData),
        Promise.all(
          buckets.map((bucket) => {
            const range = rangeOf(bucket)
            return reportApi
              .getIncomeExpense(range.startDate, range.endDate)
              .then(unwrapApiData)
              .then((data) => ({ label: bucket.label, income: data.income.actual, expense: data.expense.actual }))
          }),
        ),
      ])
      return mapFlowReport(main, series, ledger, from, to)
    },
  })
  return resultOf(query, enabled)
}

export function useApiCashReport(from: string, to: string, ledger: Ledger, enabled: boolean): ApiReportResult<CashReport> {
  const query = useQuery({
    queryKey: ['hf', 'report', 'cash', from, to],
    enabled,
    queryFn: async () => {
      const data = await reportApi.getCashFlow(from, to).then(unwrapApiData)
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
