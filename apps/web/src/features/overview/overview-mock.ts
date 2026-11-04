/**
 * 总览页静态 mock（HF 阶段）。走势与快照数据在 R 批换成真实 API。
 */
import type { TrendPoint } from './overview-utils'

export const OVERVIEW_MOCK = {
  monthLabel: '2026 年 11 月',
  asOfLabel: '数据截至 11-04',
  netWorth: 286345.2,
  liquid: 82145.6,
  invest: 204199.6,
  netWorthChange: 2.8,
  incomeChange: 8.2,
  expenseChange: 3.1,
  /** 近 12 个月净资产快照，最后一个点为当前值。 */
  trend: [
    { label: '12月', value: 218400 },
    { label: '1月', value: 221900 },
    { label: '2月', value: 226300 },
    { label: '3月', value: 229800 },
    { label: '4月', value: 234500 },
    { label: '5月', value: 238100 },
    { label: '6月', value: 243600 },
    { label: '7月', value: 248900 },
    { label: '8月', value: 254200 },
    { label: '9月', value: 261800 },
    { label: '10月', value: 274500 },
    { label: '11月', value: 286345.2 },
  ] satisfies TrendPoint[],
}

/** 最近流水条数：PC 一屏 3 条，移动 4 条（UX3 §3）。 */
export const RECENT_LIMIT = { pc: 3, mobile: 4 } as const
