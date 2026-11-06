import './budgetProgress.css'
import type { CSSProperties } from 'react'

export type BudgetProgressLevel = 'normal' | 'warning' | 'over' | 'achieved' | 'neutral'

/** 轨道按 0–130% 刻度铺满：100% 预算位在 76.9231%，缺口只在这里切一刀。 */
const SCALE = 130
const TICK_PERCENT = 76.9231
/** 超支保底：越过 100% 后先留 2px 缺口，再画 6px 红段，101% 也看得见。 */
const OVER_MIN_WIDTH = `calc(${TICK_PERCENT}% + 8px)`

/** level → 填充 token（neutral 仅在收入进行中填充，见 neutralFill）。 */
const FILL_TOKENS = {
  normal: 'var(--mb-progress-normal)',
  warning: 'var(--mb-progress-warning)',
  over: 'var(--mb-progress-over)',
  // achieved 与 normal 是同一个绿：绿只表示「良好」，不再保留第二套绿。
  achieved: 'var(--mb-progress-normal)',
} as const

export function BudgetProgress({
  level,
  percent,
  label,
  neutralFill = false,
}: {
  level: BudgetProgressLevel
  percent: number
  label: string
  /** 收入进行中：neutral 也要画钢色条；转账（默认 false）仍不渲染条。 */
  neutralFill?: boolean
}) {
  const safe = Number.isFinite(percent) ? Math.max(0, percent) : 0
  // 单段填充：0–130% 共用一段，超支时连续跨过 100% 刻度缺口，不再拼接第二段。
  const fill = level === 'neutral' && !neutralFill ? 0 : (Math.min(SCALE, safe) / SCALE) * 100
  const fillToken =
    level === 'neutral'
      ? neutralFill
        ? 'var(--mb-progress-neutral)'
        : null
      : FILL_TOKENS[level]
  const width = level === 'over' ? undefined : `${fill}%`
  // over 用 CSS max() 在渲染层取保底；写成自定义属性便于单测断言，避免 jsdom 丢弃 max()。
  const overStyle: CSSProperties | undefined =
    level === 'over'
      ? ({
          '--mb-fill-width': `${fill}%`,
          '--mb-over-min': OVER_MIN_WIDTH,
          background: FILL_TOKENS.over,
        } as CSSProperties)
      : undefined

  return (
    <div
      className="mb-progress"
      data-level={level}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(100, safe))}
      aria-label={label}
    >
      {fillToken && (
        <span
          className={`mb-progress-fill${level === 'over' ? ' is-over' : ''}`}
          style={level === 'over' ? overStyle : { width, background: fillToken }}
        />
      )}
      {/* 100% 刻度缺口：与轨道同色，未满时不可见，超支时在条面中间切出一刀。
          转账没有预算刻度，不渲染；收入进行中有目标位，照常渲染。 */}
      {(level !== 'neutral' || neutralFill) && (
        <span className="mb-progress-tick" aria-hidden="true" />
      )}
    </div>
  )
}
