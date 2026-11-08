/**
 * 总览「未来现金流与净资产」推演卡（紧凑版）。
 *
 * 与预算页共用 useBudgetForecast 缓存：切页面不重复请求同一份数据；
 * 合计与端点只回显后端字段；不展示 budget-plan 缺口清单（预算页负责解释）。
 */
import { useMemo, useState } from 'react'
import type { ProjectionMonths } from '@contracts/types'
import { Card } from '@/features/shared/Card'
import { HfButton } from '@/features/shared/HfButton'
import { HfSegmented } from '@/features/shared/HfSegmented'
import type { DeviceMode } from '@/features/shared/types'
import { formatCurrency } from '@/utils/format'
import { alignForecast, defaultForecastMonths, hasNoBudgetAtAll, monthText, type ForecastTab } from './model'
import { useBudgetForecast } from './useBudgetForecast'
import { ForecastChart } from './ForecastChart'
import './forecast.css'

const TAB_OPTIONS = [
  { id: 'cash' as const, label: '现金流' },
  { id: 'asset' as const, label: '资产' },
]

export interface ForecastCardProps {
  device: DeviceMode
  asOf: string
  enabled: boolean
  revision: string
  onOpenBudgetPage: () => void
}

export function ForecastCard({ device, asOf, enabled, revision, onOpenBudgetPage }: ForecastCardProps) {
  const [tab, setTab] = useState<ForecastTab>('cash')
  const [months] = useState<ProjectionMonths>(() => defaultForecastMonths(device))
  const { state, retry } = useBudgetForecast({ enabled, months, asOf, revision })
  const points = useMemo(() => (state.status === 'ready' ? alignForecast(state.data) : []), [state])

  if (!enabled) return null

  const allNoBudget = points.length > 0 && hasNoBudgetAtAll(points)
  const first = points[0]
  const last = points[points.length - 1]

  let startText = ''
  let endText = ''
  if (state.status === 'ready' && first && last) {
    if (tab === 'cash') {
      if (first.cash && last.cash) {
        startText = formatCurrency(first.cash.endCash)
        endText = formatCurrency(last.cash.endCash)
      }
    } else {
      startText = formatCurrency(state.data.asset.base.netWorth)
      if (last.asset) endText = formatCurrency(last.asset.total.netWorth)
    }
  }

  return (
    <Card className="mb-fc-card">
      <div className="mb-fc-card-head">
        <div>
          <h2 className="mb-fc-card-title">未来现金流与净资产</h2>
          {state.status === 'ready' && (
            <p className="mb-fc-sub">
              {tab === 'cash'
                ? `起点现金 ${formatCurrency(state.data.cash.startCash)}`
                : `基准净资产 ${formatCurrency(state.data.asset.base.netWorth)}`}
            </p>
          )}
        </div>
        <HfSegmented variant="forecast" label="推演口径" value={tab} options={TAB_OPTIONS} onChange={setTab} />
      </div>

      {state.status === 'loading' && (
        <div className="mb-fc-skeleton mb-fc-skeleton-card" aria-label="正在计算推演">
          <span className="mb-fc-skeleton-block" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="mb-fc-card-state">
          <span>推演数据加载失败</span>
          <HfButton variant="link" onClick={retry}>
            重试
          </HfButton>
        </div>
      )}

      {state.status === 'ready' && (points.length === 0 || allNoBudget) && (
        <div className="mb-fc-card-state">
          <span>设置预算后查看未来现金流与资产</span>
          <HfButton variant="link" onClick={onOpenBudgetPage}>
            去设置预算 →
          </HfButton>
        </div>
      )}

      {state.status === 'ready' && points.length > 0 && !allNoBudget && (
        <>
          <ForecastChart
            device={device}
            tab={tab}
            points={points}
            selected={null}
            onSelect={() => {}}
            compact
          />
          <div className="mb-fc-card-foot">
            <span>
              {monthText(first?.label ?? '')} {tab === 'cash' ? '月末现金' : '净资产'} {startText}
              {endText && ` → ${monthText(last?.label ?? '')} ${endText}`}
            </span>
            <HfButton variant="link" onClick={onOpenBudgetPage}>
              查看预算推演 →
            </HfButton>
          </div>
        </>
      )}
    </Card>
  )
}
