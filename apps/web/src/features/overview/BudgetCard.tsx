import { ArrowRight, TriangleAlert } from 'lucide-react'
import { Card } from '@/features/shared/Card'
import { Button } from '@/features/shared/Button'
import { amountText, percentText } from './format'
import { BudgetProgress } from '@/features/shared/BudgetProgress'
import type { BudgetSummary } from './model'

export function BudgetCard({
  summary,
  mobile,
  onOpenAll,
}: {
  summary: BudgetSummary
  mobile?: boolean
  onOpenAll: () => void
}) {
  const visibleRows = summary.rows.slice(0, mobile ? 3 : 4)

  return (
    <Card>
      <div className="mb-shared-head">
        <div>
          <h2 className="mb-shared-sec-title">本月预算</h2>
          <p className="mb-shared-sec-desc">
            {summary.rows.length} 个分类 · 总预算 {amountText(summary.limit)}
          </p>
        </div>
        <span className="mb-bg-badge">{Math.round(summary.percent)}% 已用</span>
      </div>

      <div className="mb-bg-list">
        {visibleRows.map((row) => (
          <div key={row.id} className="mb-ov-budget-row" data-level={row.level}>
            <div className="mb-bg-row-head">
              <span className="mb-ov-budget-name">{row.name}</span>
              <span className="mb-bg-percent">
                {(row.level === 'warning' || row.level === 'over') && (
                  <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
                )}
                {percentText(row.percent, false)}
              </span>
            </div>
            <BudgetProgress
              level={row.level}
              percent={row.percent}
              label={`${row.name}预算使用 ${Math.round(row.percent)}%`}
            />
            <div className="mb-bg-meta">
              <span>
                {amountText(row.used)} / {amountText(row.limit)}
              </span>
              {row.level === 'over' && row.used > row.limit && (
                <span className="mb-bg-over">超支 {amountText(row.used - row.limit)}</span>
              )}
              {row.level === 'warning' && row.percent >= 100 && (
                <span className="mb-bg-limit">已达上限</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button variant="link" className="mb-shared-foot" onClick={onOpenAll}>
        查看全部预算
        <ArrowRight size={14} />
      </Button>
    </Card>
  )
}
