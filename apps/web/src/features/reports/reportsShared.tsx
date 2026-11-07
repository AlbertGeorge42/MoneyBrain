/**
 * 报表页共用的非组件导出：视图页签清单与图表栅格。
 * 单独成文件，避免组件文件同时导出常量 / 函数触发 react-refresh 警告。
 */
import type { ReactNode } from 'react'
import type { DeviceMode } from '@/features/shared/types'
import type { ReportTab } from './reportsTime'

export const REPORT_TABS: readonly { id: ReportTab; label: string }[] = [
  { id: 'balance', label: '资产负债' },
  { id: 'flow', label: '收支明细' },
  { id: 'cash', label: '现金流' },
  { id: 'invest', label: '投资分析' },
]

export function chartGrid(device: DeviceMode, charts: ReactNode) {
  if (device === 'mobile') return <div className="mb-rp-chart-scroll">{charts}</div>
  return <div className="mb-rp-chart-grid">{charts}</div>
}
