import { ChartLine } from 'lucide-react'
import { formatAmount, formatUnsigned } from '../transactions/transaction-utils'
import type { DeviceMode } from '../transactions/types'
import { getChartTokens, type ColorScheme } from '../../styles/theme/tokens'
import { buildTrendGeometry, formatCompactMoney } from '../overview/overview-utils'
import type { CompositionPanel, ReportTone, ReportViewData } from './reports-mock'

type ReportChartsProps = {
  view: ReportViewData
  device: DeviceMode
  scheme: ColorScheme
}

function panelColor(tokens: ReturnType<typeof getChartTokens>, tone: ReportTone): string {
  if (tone === 'income') return tokens.income
  if (tone === 'expense') return tokens.expense
  return tokens.series[0]
}

function panelTotal(panel: CompositionPanel): string {
  return panel.format === 'signed' ? formatAmount(panel.total) : formatUnsigned(panel.total)
}

function itemTotal(panel: CompositionPanel, value: number): string {
  return panel.format === 'signed' ? formatAmount(value) : formatUnsigned(value)
}

function CompositionView({ panel, tokens }: { panel: CompositionPanel; tokens: ReturnType<typeof getChartTokens> }) {
  const max = Math.max(...panel.items.map((item) => Math.abs(item.value)), 0)
  const color = panelColor(tokens, panel.tone)

  return (
    <div className="rep-comp-panel" data-tone={panel.tone}>
      <div className="rep-comp-head">
        <h4 className="mb-title-4">{panel.title}</h4>
        <span className="mb-text-0 mb-num">合计 {panelTotal(panel)}</span>
      </div>
      {panel.items.length === 0 || max === 0 ? (
        <p className="rep-comp-empty mb-text-0">本期还没有可绘制的构成。</p>
      ) : (
        <div className="rep-comp-rows">
          {panel.items.map((item) => (
            <div key={item.label} className="rep-comp-row">
              <span className="rep-comp-label">{item.label}</span>
              <span className="rep-comp-track" aria-hidden>
                <span
                  className="rep-comp-bar"
                  style={{ width: `${max === 0 ? 0 : (Math.abs(item.value) / max) * 100}%`, background: color }}
                />
              </span>
              <span className="rep-comp-value mb-num">{itemTotal(panel, item.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ReportCharts({ view, device, scheme }: ReportChartsProps) {
  const tokens = getChartTokens(scheme)
  const geometry = buildTrendGeometry(view.trend)
  const panels = device === 'mobile'
    ? [view.composition.mobileSide === 'secondary' && view.composition.secondary
      ? view.composition.secondary
      : view.composition.primary]
    : [view.composition.primary, view.composition.secondary].filter(
      (panel): panel is CompositionPanel => Boolean(panel),
    )

  const trendColor = view.trend[view.trend.length - 1]?.value < 0 ? tokens.expense : tokens.series[0]

  return (
    <div className={`rep-charts rep-charts--${device}`}>
      <section className="rep-chart-card" aria-label="走势">
        <div className="rep-chart-head">
          <h3 className="mb-title-4">走势</h3>
          <span className="mb-text-0">{view.trendLabel}</span>
        </div>
        {geometry === null ? (
          <div className="rep-chart-empty">
            <ChartLine aria-hidden />
            <p className="mb-text-0">本期记录不足两个时间点，走势会在记录积累后出现。</p>
          </div>
        ) : (
          <div className="rep-trend">
            <div className="rep-trend-y mb-num" aria-hidden>
              <span>{formatCompactMoney(geometry.max)}</span>
              <span>{formatCompactMoney(geometry.mid)}</span>
              <span>{formatCompactMoney(geometry.min)}</span>
            </div>
            <div className="rep-trend-main">
              <svg
                className="rep-trend-svg"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                role="img"
                aria-label={`${view.trendLabel}，${view.trend[0].label} ${formatCompactMoney(view.trend[0].value)}，${view.trend[view.trend.length - 1].label} ${formatCompactMoney(view.trend[view.trend.length - 1].value)}`}
              >
                <path d={geometry.areaPath} fill={trendColor} opacity={0.12} />
                <path d={geometry.linePath} fill="none" stroke={trendColor} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                {geometry.points.map((point) => (
                  <circle
                    key={point.label}
                    cx={point.x}
                    cy={point.y}
                    r={1.6}
                    fill={trendColor}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              <div className="rep-trend-x mb-text-0" aria-hidden>
                {view.trend.map((point) => <span key={point.label}>{point.label}</span>)}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rep-chart-card" aria-label="构成">
        <div className="rep-chart-head">
          <h3 className="mb-title-4">构成</h3>
          <span className="mb-text-0">按金额从高到低，最多 6 项</span>
        </div>
        <div className={`rep-comp-grid${panels.length === 1 ? ' rep-comp-grid--single' : ''}`}>
          {panels.map((panel) => (
            <CompositionView key={panel.title} panel={panel} tokens={tokens} />
          ))}
        </div>
      </section>
    </div>
  )
}
