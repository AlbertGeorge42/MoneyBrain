/**
 * 报表展示偏好（报表设置的四个配置）
 *
 * 只落 localStorage，不写账本、不调接口。默认值与当前报表呈现一致，
 * 因此首次打开四个配置时看到的就是现状。
 *
 * 线框稿只定义了「资产负债→账户分类 / 收支明细→收支分类 / 现金流→现金流分类 /
 * 投资分析→投资资产类型」的映射，没有写展示字段；这里按既有报表结构收敛为
 * 分组口径、列集合、活动分组、目标比例与快照期间，不新增账本字段。
 */
import type { BalanceRow, CashGroup, CashReport } from './reportsModel'

export const REPORT_SETTINGS_KEY = 'mb-reports-view-settings-v1'

export type BalanceGroupMode = 'account' | 'kind'
export type FlowNamedCategories = 5 | 6
export type CashGroupKey = '经营' | '投资' | '筹资' | '未分类' | '账户间转账'
export type InvestSort = 'marketValue' | 'rate'
export type SnapshotCount = 3 | 6

export interface ReportViewSettings {
  balance: {
    groupMode: BalanceGroupMode
    showKindColumn: boolean
  }
  flow: {
    namedCategories: FlowNamedCategories
    showCountColumn: boolean
    showShareColumn: boolean
  }
  cash: {
    groups: Record<CashGroupKey, boolean>
  }
  invest: {
    showTarget: boolean
    sortBy: InvestSort
    snapshotCount: SnapshotCount
  }
}

export const CASH_GROUP_KEYS: readonly CashGroupKey[] = [
  '经营',
  '投资',
  '筹资',
  '未分类',
  '账户间转账',
]

export const DEFAULT_REPORT_SETTINGS: ReportViewSettings = {
  balance: { groupMode: 'account', showKindColumn: true },
  flow: { namedCategories: 6, showCountColumn: true, showShareColumn: true },
  cash: {
    groups: { 经营: true, 投资: true, 筹资: true, 未分类: true, 账户间转账: true },
  },
  invest: { showTarget: true, sortBy: 'marketValue', snapshotCount: 6 },
}

function cloneDefaults(): ReportViewSettings {
  return {
    balance: { ...DEFAULT_REPORT_SETTINGS.balance },
    flow: { ...DEFAULT_REPORT_SETTINGS.flow },
    cash: { groups: { ...DEFAULT_REPORT_SETTINGS.cash.groups } },
    invest: { ...DEFAULT_REPORT_SETTINGS.invest },
  }
}

/** 面板「重置」只把 draft 换回默认；确认后才落盘，取消不改变已保存配置。 */
export function defaultReportSettings(): ReportViewSettings {
  return cloneDefaults()
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** 只接受白名单值：localStorage 里的旧值 / 脏值一律回默认，不把非法状态带进报表。 */
export function normalizeReportSettings(raw: unknown): ReportViewSettings {
  const next = cloneDefaults()
  if (!raw || typeof raw !== 'object') return next
  const value = raw as Partial<Record<keyof ReportViewSettings, unknown>>

  const balance = value.balance as Partial<ReportViewSettings['balance']> | undefined
  if (balance && typeof balance === 'object') {
    next.balance.groupMode = balance.groupMode === 'kind' ? 'kind' : 'account'
    next.balance.showKindColumn = booleanOr(balance.showKindColumn, next.balance.showKindColumn)
  }

  const flow = value.flow as Partial<ReportViewSettings['flow']> | undefined
  if (flow && typeof flow === 'object') {
    next.flow.namedCategories = flow.namedCategories === 5 ? 5 : 6
    next.flow.showCountColumn = booleanOr(flow.showCountColumn, next.flow.showCountColumn)
    next.flow.showShareColumn = booleanOr(flow.showShareColumn, next.flow.showShareColumn)
  }

  const cash = value.cash as { groups?: Partial<Record<CashGroupKey, unknown>> } | undefined
  if (cash?.groups && typeof cash.groups === 'object') {
    for (const key of CASH_GROUP_KEYS) {
      next.cash.groups[key] = booleanOr(cash.groups[key], next.cash.groups[key])
    }
  }

  const invest = value.invest as Partial<ReportViewSettings['invest']> | undefined
  if (invest && typeof invest === 'object') {
    next.invest.showTarget = booleanOr(invest.showTarget, next.invest.showTarget)
    next.invest.sortBy = invest.sortBy === 'rate' ? 'rate' : 'marketValue'
    next.invest.snapshotCount = invest.snapshotCount === 3 ? 3 : 6
  }

  return next
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function loadReportSettings(): ReportViewSettings {
  const store = storage()
  if (!store) return cloneDefaults()
  try {
    const text = store.getItem(REPORT_SETTINGS_KEY)
    return text ? normalizeReportSettings(JSON.parse(text)) : cloneDefaults()
  } catch {
    return cloneDefaults()
  }
}

export function saveReportSettings(settings: ReportViewSettings): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(REPORT_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式 / 配额满：展示配置退化为当前会话，不影响报表读取。
  }
}

/** 重置只改展示偏好，不动账本。 */
export function resetReportSettings(): ReportViewSettings {
  const store = storage()
  try {
    store?.removeItem(REPORT_SETTINGS_KEY)
  } catch {
    // 同 save：存储不可用时忽略。
  }
  return cloneDefaults()
}

/** 资产负债：按性质汇总时，同一性质的多账户合并成一行。 */
export function groupBalanceRows(rows: BalanceRow[], mode: BalanceGroupMode): BalanceRow[] {
  if (mode === 'account') return rows
  const buckets = new Map<string, BalanceRow>()
  for (const row of rows) {
    const existing = buckets.get(row.kind)
    if (existing) {
      existing.amount += row.amount
    } else {
      buckets.set(row.kind, { ...row, id: `kind:${row.kind}`, name: row.kind })
    }
  }
  return [...buckets.values()].sort((left, right) => right.amount - left.amount)
}

/** 现金流：按配置隐藏活动分组；键为分组名（经营 / 投资 / 筹资 / 未分类 / 账户间转账）。 */
export function visibleCashGroups(
  groups: CashGroup[],
  settings: ReportViewSettings['cash'],
): CashGroup[] {
  return groups.filter((group) => settings.groups[group.key as CashGroupKey] !== false)
}

export function cashTotalOf(groups: CashGroup[]): number {
  return groups.reduce((sum, group) => sum + group.total, 0)
}

/** 当前期间实际存在的活动分组：不存在的分组在面板里给可见禁用原因。 */
export function cashGroupPresence(report: CashReport): Record<CashGroupKey, boolean> {
  const present = new Set<string>([...report.inflowGroups, ...report.outflowGroups].map((group) => group.key))
  return {
    经营: present.has('经营'),
    投资: present.has('投资'),
    筹资: present.has('筹资'),
    未分类: present.has('未分类'),
    账户间转账: present.has('账户间转账'),
  }
}

export function sortHoldingRows<T extends { marketValue: number; rate: number }>(
  rows: T[],
  sortBy: InvestSort,
): T[] {
  const sorted = [...rows].sort((left, right) =>
    sortBy === 'rate' ? right.rate - left.rate : right.marketValue - left.marketValue,
  )
  return sorted
}

export function sliceSnapshots<T>(snapshots: T[], count: SnapshotCount): T[] {
  return count >= snapshots.length ? snapshots : snapshots.slice(-count)
}
