/**
 * 报表设置：只保存数据范围（是否把「不计收支」流水并入收支明细）。
 *
 * 展示口径不再可配置——四张报表固定按账本分类结构呈现，报表设置里只提供
 * 当前报表对应的分类管理入口，因此没有 draft / 确认 / 重置流程。
 * 文件里另外几处是四个视图共用的固定口径纯变换，与存储无关。
 */
import type { CashGroup } from './reportsModel'

export const REPORT_SETTINGS_KEY = 'mb-reports-view-settings-v1'

export interface ReportViewSettings {
  /** 数据范围：影响收支明细的统计口径，不改变期间与账户筛选。 */
  dataScope: {
    includeExcluded: boolean
  }
}

export const DEFAULT_REPORT_SETTINGS: ReportViewSettings = {
  dataScope: { includeExcluded: false },
}

/** 面板「重置」入口已移除；保留函数供读取默认值与测试使用。 */
export function defaultReportSettings(): ReportViewSettings {
  return { dataScope: { ...DEFAULT_REPORT_SETTINGS.dataScope } }
}

/** 旧版本 localStorage 里还带着四份视图配置，忽略即可；布尔值之外一律回默认。 */
export function normalizeReportSettings(raw: unknown): ReportViewSettings {
  const next = defaultReportSettings()
  if (!raw || typeof raw !== 'object') return next
  const scope = (raw as { dataScope?: unknown }).dataScope as
    | { includeExcluded?: unknown }
    | undefined
  if (scope && typeof scope === 'object' && typeof scope.includeExcluded === 'boolean') {
    next.dataScope.includeExcluded = scope.includeExcluded
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
  if (!store) return defaultReportSettings()
  try {
    const text = store.getItem(REPORT_SETTINGS_KEY)
    return text ? normalizeReportSettings(JSON.parse(text)) : defaultReportSettings()
  } catch {
    return defaultReportSettings()
  }
}

export function saveReportSettings(settings: ReportViewSettings): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(REPORT_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式 / 配额满：数据范围退化为当前会话，不影响报表读取。
  }
}

/** 现金流固定显示全部活动分组，表尾合计就是各组之和。 */
export function cashTotalOf(groups: CashGroup[]): number {
  return groups.reduce((sum, group) => sum + group.total, 0)
}

/** 净值走势固定展示近 6 期。 */
export function sliceSnapshots<T>(snapshots: T[]): T[] {
  return snapshots.length <= 6 ? snapshots : snapshots.slice(-6)
}
