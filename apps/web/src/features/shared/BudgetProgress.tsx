import './budgetProgress.css'

export type BudgetProgressLevel = 'normal' | 'warning' | 'over' | 'achieved' | 'neutral'

/** 轨道按 0–130% 刻度铺满：100% 预算位在 76.9231%，缺口只在这里切一刀。 */
const SCALE = 130

/** level → 填充 token（neutral 不填充，因此不在表内）。 */
const FILL_TOKENS = {
  normal: 'var(--mb-progress-normal)',
  warning: 'var(--mb-progress-warning)',
  over: 'var(--mb-progress-over)',
  achieved: 'var(--mb-progress-achieved)',
} as const

export function BudgetProgress({
  level,
  percent,
  label,
}: {
  level: BudgetProgressLevel
  percent: number
  label: string
}) {
  const safe = Number.isFinite(percent) ? Math.max(0, percent) : 0
  // 单段填充：0–130% 共用一段，超支时连续跨过 100% 刻度缺口，不再拼接第二段。
  const fill = level === 'neutral' ? 0 : (Math.min(SCALE, safe) / SCALE) * 100
  const fillToken = level === 'neutral' ? null : FILL_TOKENS[level]

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
        <span className="mb-progress-fill" style={{ width: `${fill}%`, background: fillToken }} />
      )}
      {/* 100% 刻度缺口：与轨道同色，未满时不可见，超支时在条面中间切出一刀。
          转账没有预算刻度，不渲染。 */}
      {level !== 'neutral' && <span className="mb-progress-tick" aria-hidden="true" />}
    </div>
  )
}
