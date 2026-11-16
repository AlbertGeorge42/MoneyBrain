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
import { Button } from './Button'
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
    <div className="mb-shared-period" role="group" aria-label={groupLabel}>
      <div className="mb-shared-bar">
        <Button className="mb-shared-bar-nav" aria-label={prevLabel} onClick={onPrev}>
          <ChevronLeft size={16} />
        </Button>
        <span className="mb-shared-bar-label">{label}</span>
        <Button
          className="mb-shared-bar-nav"
          aria-label={nextLabel}
          disabled={nextDisabled}
          aria-disabled={nextDisabled}
          title={nextDisabled ? disabledReason : undefined}
          onClick={onNext}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
      {note && <span className="mb-shared-bar-note">{note}</span>}
      {onReset && resetLabel && (
        <Button variant="link" className="mb-shared-bar-reset" onClick={onReset}>
          {resetLabel}
        </Button>
      )}
    </div>
  )
}
