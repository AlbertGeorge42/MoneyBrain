/**
 * 期间条：报表时间条与预算月份条共用的外壳。
 *
 * 只负责「上一期 / 当前值 / 下一期」的 DOM 与视觉，不参与任何时间派生：
 * 报表的时点/期间、预设、粒度由 TimeBar 自己决定；预算的月份步进与
 * 「无流水」判定留在 BudgetPage。超出外壳的可见原因与「回到本月」放在
 * 外壳之外，避免把说明文字塞进控件胶囊。
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { HfButton } from './HfButton'
import './periodBar.css'

interface PeriodBarProps {
  /** 无障碍分组名，如「预算月份」。 */
  groupLabel: string
  /** 当前值：月份文案或日期区间。 */
  label: ReactNode
  prevLabel: string
  nextLabel: string
  onPrev: () => void
  onNext: () => void
  nextDisabled?: boolean
  /** 禁用时的 title 原因；与 note 分开，前者进 tooltip，后者可见。 */
  disabledReason?: string
  /** 可见原因，如「2026 年 12 月无流水」。 */
  note?: ReactNode
  resetLabel?: string
  onReset?: () => void
}

export function PeriodBar({
  groupLabel,
  label,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  nextDisabled = false,
  disabledReason,
  note,
  resetLabel,
  onReset,
}: PeriodBarProps) {
  return (
    <div className="mb-period" role="group" aria-label={groupLabel}>
      <div className="mb-period-bar">
        <HfButton className="mb-period-bar-nav" aria-label={prevLabel} onClick={onPrev}>
          <ChevronLeft size={16} />
        </HfButton>
        <span className="mb-period-bar-label">{label}</span>
        <HfButton
          className="mb-period-bar-nav"
          aria-label={nextLabel}
          disabled={nextDisabled}
          aria-disabled={nextDisabled}
          title={nextDisabled ? disabledReason : undefined}
          onClick={onNext}
        >
          <ChevronRight size={16} />
        </HfButton>
      </div>
      {note && <span className="mb-period-bar-note">{note}</span>}
      {onReset && resetLabel && (
        <HfButton variant="link" className="mb-period-bar-reset" onClick={onReset}>
          {resetLabel}
        </HfButton>
      )}
    </div>
  )
}
