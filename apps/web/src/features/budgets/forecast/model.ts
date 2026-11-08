/**
 * 预算推演：前端只做「对齐 + 展示」，不做推演计算。
 *
 * 硬规则（docs/blueprint/ux/budget-forecast.md §6）：
 * - 所有合计 / 折线端点取后端字段（inflow|outflow|net.total、endCash、total.netWorth、base）；
 * - 不用 reduce/sum 合并数字、不做 base + Σ、不拿相邻点相减、不做周/年→月折算；
 * - `covered[]` 只用于解释，不参与任何合计（F11）；
 * - 前端不自行推算月份边界：fromMonth 直接取投影首个 label。
 */
import type {
  AssetProjectionPoint,
  AssetProjectionResult,
  BudgetPeriodPlanPoint,
  BudgetPeriodPlanResult,
  CashFlowProjectionPoint,
  CashFlowProjectionResult,
  ProjectionMonths,
} from '@contracts/types'
import type { Ledger } from '@/features/overview/model'

export type ForecastTab = 'cash' | 'asset'

export interface ForecastBundle {
  asset: AssetProjectionResult
  cash: CashFlowProjectionResult
  plan: BudgetPeriodPlanResult | null
  fetchedAt: number
}

/** 一个月在图表上的对齐结果：任一侧缺失即为缺口，不用 0 或上期值补。 */
export interface ForecastPoint {
  label: string
  asset: AssetProjectionPoint | null
  cash: CashFlowProjectionPoint | null
  plan: BudgetPeriodPlanPoint | null
}

export const FORECAST_MONTH_OPTIONS: readonly ProjectionMonths[] = [3, 6, 12]

/** 默认窗口：桌面 6 个月、移动 3 个月（预算页与总览一致）。 */
export function defaultForecastMonths(device: 'desktop' | 'mobile'): ProjectionMonths {
  return device === 'mobile' ? 3 : 6
}

/** 月份标签格式化（仅展示）：`2026-11` → `11月`。 */
export function monthText(label: string): string {
  const parts = label.split('-')
  return parts.length > 1 ? `${Number(parts[1])}月` : label
}

/** 以资产序列的 label 为轴对齐现金流与预算计划；不做插值或合并。 */
export function alignForecast(bundle: ForecastBundle): ForecastPoint[] {
  const cashByMonth = new Map(bundle.cash.points.map((point) => [point.label, point]))
  const planByMonth = new Map((bundle.plan?.points ?? []).map((point) => [point.month, point]))
  return bundle.asset.points.map((asset) => ({
    label: asset.label,
    asset,
    cash: cashByMonth.get(asset.label) ?? null,
    plan: planByMonth.get(asset.label) ?? null,
  }))
}

/** 该月是否缺口：预算未覆盖，或对应投影点缺失。 */
export function isGap(point: ForecastPoint, tab: ForecastTab): boolean {
  const data = tab === 'asset' ? point.asset : point.cash
  return point.plan?.hasBudget !== true || data === null
}

/** 所有月份都未设预算（整段空态），与「个别月缺口」区分。 */
export function hasNoBudgetAtAll(points: ForecastPoint[]): boolean {
  return points.every((point) => point.plan?.hasBudget !== true)
}

/** 本地日历日（后端 asOf 默认同口径）；只用于取数参数，不参与月份边界推算。 */
export function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * 取数缓存键的账本因子：预算字段或流水条数变化时换 key，避免拿旧推演结果；
 * 字段拼接只是身份标识，不做任何金额运算。
 */
export function forecastRevision(ledger: Ledger): string {
  const budgetPart = ledger.budgets
    .map((budget) => [budget.id, budget.limit, budget.period, budget.isActive ? 1 : 0, budget.transactionTime ?? ''].join(':'))
    .join('|')
  return `${budgetPart}#${ledger.transactions.length}`
}
