import './budgetProgress.css'

export type BudgetProgressLevel = 'normal' | 'warning' | 'over' | 'achieved' | 'neutral'

/** 轨道按 0–130% 刻度铺满：100% 预算位在 76.92%，右侧 30% 为溢出区。 */
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
  const fill = level === 'neutral' ? 0 : (Math.min(100, safe) / SCALE) * 100
  const spill = level === 'over' ? (Math.min(Math.max(0, safe - 100), SCALE - 100) / SCALE) * 100 : 0
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
      {fillToken && <span className="mb-progress-headroom" aria-hidden="true" />}
      {fillToken && (
        <span className="mb-progress-fill" style={{ width: `${fill}%`, background: fillToken }} />
      )}
      {spill > 0 && (
        <span
          className="mb-progress-spill"
          style={{ left: `${(100 / SCALE) * 100}%`, width: `${spill}%` }}
        />
      )}
    </div>
  )
}
