/**
 * 预算页「预算推演」面板。
 *
 * 取数只走 useBudgetForecast（三端点一次取回、跨页缓存）；tab/范围切换不触发请求。
 * 所有数字来自后端字段；缺口月份不用 0 或上期值补。
 */
import { useMemo, useState } from 'react'
import type { ProjectionMonths } from '@contracts/types'
import { Card } from '@/features/shared/Card'
import { HfButton } from '@/features/shared/HfButton'
import { HfSegmented } from '@/features/shared/HfSegmented'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import { formatCurrency } from '@/utils/format'
import {
  FORECAST_MONTH_OPTIONS,
  alignForecast,
  defaultForecastMonths,
  hasNoBudgetAtAll,
  monthText,
  type ForecastTab,
} from './model'
import { useBudgetForecast } from './useBudgetForecast'
import { ForecastChart } from './ForecastChart'
import { ForecastDetail } from './ForecastDetail'
import './forecast.css'

const TAB_OPTIONS = [
  { id: 'cash' as const, label: '现金流' },
  { id: 'asset' as const, label: '资产' },
]

const MONTH_OPTIONS = FORECAST_MONTH_OPTIONS.map((months) => ({
  id: String(months),
  label: `${months} 个月`,
}))

export interface ForecastPanelProps {
  device: DeviceMode
  asOf: string
  enabled: boolean
  revision: string
  onCreateBudget: () => void
}

export function ForecastPanel({ device, asOf, enabled, revision, onCreateBudget }: ForecastPanelProps) {
  const [tab, setTab] = useState<ForecastTab>('cash')
  const [months, setMonths] = useState<ProjectionMonths>(() => defaultForecastMonths(device))
  const [selected, setSelected] = useState<number | null>(device === 'mobile' ? null : 0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const { state, retry } = useBudgetForecast({ enabled, months, asOf, revision })

  const points = useMemo(() => (state.status === 'ready' ? alignForecast(state.data) : []), [state])
  const allNoBudget = points.length > 0 && hasNoBudgetAtAll(points)
  const inlineIndex = selected ?? 0
  const detailPoint = points[inlineIndex] ?? null

  if (!enabled) return null

  const changeMonths = (next: string) => {
    setMonths(Number(next) as ProjectionMonths)
    setSelected(device === 'mobile' ? null : 0)
    setSheetOpen(false)
  }

  const selectMonth = (index: number) => {
    setSelected(index)
    if (device === 'mobile') setSheetOpen(true)
  }

  const openDetail = () => {
    setSelected((current) => current ?? 0)
    setSheetOpen(true)
  }

  return (
    <Card className="mb-fc-panel">
      <div className="mb-fc-head">
        <div className="mb-fc-head-copy">
          <h2 className="mb-fc-title">预算推演</h2>
          {state.status === 'ready' && (
            <p className="mb-fc-sub">
              起点现金 {formatCurrency(state.data.cash.startCash)} · 基准净资产{' '}
              {formatCurrency(state.data.asset.base.netWorth)}
            </p>
          )}
          {state.status !== 'ready' && <p className="mb-fc-sub">未来 3–12 个自然月，按预算与已排定交易展开</p>}
        </div>
        <div className="mb-fc-controls">
          <HfSegmented variant="forecast" label="推演口径" value={tab} options={TAB_OPTIONS} onChange={setTab} />
          <HfSegmented variant="forecast" label="推演范围" value={String(months)} options={MONTH_OPTIONS} onChange={changeMonths} />
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="mb-fc-skeleton" aria-label="正在计算推演">
          <span className="mb-fc-skeleton-line" />
          <span className="mb-fc-skeleton-block" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="mb-fc-state">
          <p className="mb-fc-state-title">推演数据加载失败</p>
          <p className="mb-fc-state-desc">{state.message}</p>
          <HfButton variant="secondary" onClick={retry}>
            重试
          </HfButton>
        </div>
      )}

      {state.status === 'ready' && points.length === 0 && (
        <div className="mb-fc-state">
          <p className="mb-fc-state-title">暂无推演数据</p>
          <p className="mb-fc-state-desc">后端未返回未来月份点位，可稍后重试。</p>
          <HfButton variant="secondary" onClick={retry}>
            重试
          </HfButton>
        </div>
      )}

      {state.status === 'ready' && points.length > 0 && allNoBudget && (
        <div className="mb-fc-state">
          <p className="mb-fc-state-title">设置预算后查看未来现金流与资产</p>
          <p className="mb-fc-state-desc">当前推演区间内没有任何预算展开点位。</p>
          <HfButton variant="primary" onClick={onCreateBudget}>
            新增预算
          </HfButton>
        </div>
      )}

      {state.status === 'ready' && points.length > 0 && !allNoBudget && (
        <>
          <ForecastChart device={device} tab={tab} points={points} selected={selected} onSelect={selectMonth} />
          <div className="mb-fc-legend">
            <span className="mb-fc-legend-item"><i className="mb-fc-swatch mb-fc-swatch-actual" />已发生</span>
            <span className="mb-fc-legend-item"><i className="mb-fc-swatch mb-fc-swatch-planned" />按预算计划</span>
            <span className="mb-fc-legend-item"><i className="mb-fc-swatch mb-fc-swatch-committed" />已排定</span>
            <span className="mb-fc-legend-item"><i className="mb-fc-swatch mb-fc-swatch-gap" />未设预算</span>
            <span className="mb-fc-legend-note">
              {tab === 'cash' ? '折线：月末现金（右轴）' : '折线：净资产合计；虚线为实际基准'}
            </span>
          </div>

          {device === 'mobile' ? (
            <div className="mb-fc-mobile-detail">
              <span className="mb-fc-mobile-month">
                {selected === null ? '点按柱子查看明细' : `${monthText(points[inlineIndex]?.label ?? '')} 明细`}
              </span>
              <HfButton variant="link" onClick={openDetail}>
                查看明细
              </HfButton>
            </div>
          ) : (
            detailPoint && <ForecastDetail tab={tab} point={detailPoint} />
          )}

          <p className="mb-fc-footnote">
            推演结果用于解释未来口径；实际预算执行仍以预算页头部与总览预算卡（/budgets/statuses）为准。
          </p>
        </>
      )}

      {device === 'mobile' && (
        <HfSheet
          variant="budget"
          device={device}
          opened={sheetOpen}
          onClose={() => setSheetOpen(false)}
          zIndex={320}
          contentClassName="mb-fc-sheet"
          mobileSize="auto"
          title={<span className="mb-overlay-title">推演明细</span>}
        >
          {detailPoint ? (
            <ForecastDetail tab={tab} point={detailPoint} />
          ) : (
            <p className="mb-fc-detail-empty">该月数据未就绪</p>
          )}
        </HfSheet>
      )}
    </Card>
  )
}
