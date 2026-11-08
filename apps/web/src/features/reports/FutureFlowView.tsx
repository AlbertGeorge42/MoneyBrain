/**
 * 收支未来区间（报表未来时间轴 P5）
 *
 * 未来端点只有预算计划，没有 actual / planned / committed 分项：
 * - 全未来桶只展示「预测 · 预算计划」，不显示「真实 + 预测 = 合计」；
 * - 跨 asOf 的混合桶把「已发生」与「预算计划」分段展示，不相加、不显示桶内总合计；
 * - 不做跨桶额度合计；hasBudget=false 显示「未设预算」，不用 0 冒充。
 *
 * 已发生额来自历史收支报表的逐桶 actual，仅用于混合/已过桶的分段展示。
 */
import type { BudgetPeriodPlanPoint, BudgetPeriodPlanResult } from '@contracts/types'
import { Card } from '@/features/shared/Card'
import type { DeviceMode } from '@/features/shared/types'
import { currency, type FlowReport } from './reportsModel'
import { PredictionBadge } from './prediction'
import { GRANULARITY_LABELS, type Granularity } from './reportsTime'
import { projectionBucketState } from './futureModel'

const TYPE_LABELS: Record<'income' | 'expense' | 'transfer', string> = {
  income: '收入',
  expense: '支出',
  transfer: '转账',
}

function PlanTag() {
  return (
    <span className="mb-rp-flow-tag">
      <PredictionBadge kind="prediction" />
      <span aria-hidden="true">·</span>
      <PredictionBadge kind="budgetPlan" />
    </span>
  )
}

function OccurrenceRows({ point }: { point: BudgetPeriodPlanPoint }) {
  return (
    <ul className="mb-rp-flow-points">
      {point.budgets.map((budget) => (
        <li key={`${budget.budgetId}-${budget.date}`} className="mb-rp-flow-point">
          <span className="mb-rp-flow-point-date">{budget.date.slice(5)}</span>
          <span className="mb-rp-flow-point-name">{budget.budgetName}</span>
          <span className={`mb-rp-flow-point-type is-${budget.type}`}>{TYPE_LABELS[budget.type]}</span>
          <span className="mb-rp-flow-point-amount">{currency(budget.amount)}</span>
        </li>
      ))}
    </ul>
  )
}

function BucketSection({
  point,
  state,
  actual,
  asOf,
}: {
  point: BudgetPeriodPlanPoint
  state: 'past' | 'mixed' | 'future'
  actual: FlowReport['series'][number] | null
  asOf: string
}) {
  const occurrences = point.budgets.filter((budget) => budget.date > asOf)
  return (
    <section className={`mb-rp-flow-bucket is-${state}`} aria-label={`${point.label} 预算计划`}>
      <header className="mb-rp-flow-bucket-head">
        <strong>{point.label}</strong>
        <span>
          {point.start.slice(5)} ~ {point.end.slice(5)}
        </span>
        {state !== 'past' && <PlanTag />}
      </header>
      {state !== 'future' && actual !== null && (
        <div className="mb-rp-flow-segment is-actual">
          <div className="mb-rp-flow-segment-head">
            已发生
            <span>截至 {asOf.slice(5)}</span>
          </div>
          <div className="mb-rp-flow-actual">
            <span>收入</span>
            <span className="is-income">{currency(actual.income)}</span>
            <span>支出</span>
            <span className="is-expense">{currency(actual.expense)}</span>
          </div>
        </div>
      )}
      {state !== 'past' && (
        <div className="mb-rp-flow-segment is-plan">
          <div className="mb-rp-flow-segment-head">
            预算计划
            {state === 'mixed' && <span>仅剩余日期，不与已发生相加</span>}
          </div>
          {!point.hasBudget ? (
            <p className="mb-rp-flow-empty">未设预算</p>
          ) : occurrences.length === 0 ? (
            <p className="mb-rp-flow-empty">剩余日期没有预算点位</p>
          ) : (
            <OccurrenceRows point={{ ...point, budgets: occurrences }} />
          )}
          {state === 'future' && point.totals && (
            <div className="mb-rp-flow-totals">
              <span>桶内合计（后端）</span>
              <span>收入 {currency(point.totals.income)}</span>
              <span>支出 {currency(point.totals.expense)}</span>
              <span>转账 {currency(point.totals.transfer)}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export function FutureFlowView({
  device,
  plan,
  actual,
}: {
  device: DeviceMode
  plan: BudgetPeriodPlanResult
  actual: FlowReport | null
}) {
  if (plan.points.length === 0) {
    return (
      <Card variant="report" className="mb-rp-empty">
        <h2 className="mb-rp-empty-title">未来区间暂无预算计划</h2>
        <p className="mb-rp-empty-desc">请检查预算是否启用，或把时间范围调回已发生区间。</p>
      </Card>
    )
  }

  const rows = plan.points.map((point, index) => ({
    point,
    state: projectionBucketState(point.start, point.end, plan.asOf),
    actual: actual?.series[index] ?? null,
  }))
  const futureCount = rows.filter((row) => row.state !== 'past').length

  return (
    <Card variant="report" className="mb-rp-flow-card" data-device={device}>
      <div className="mb-rp-sec-head">
        <div>
          <h3 className="mb-rp-sec-title">
            未来收支 · <PlanTag />
          </h3>
          <p className="mb-rp-sec-desc">
            {plan.start} ~ {plan.end} · 按{GRANULARITY_LABELS[plan.granularity as Granularity]}桶 ·
            数据截至 {plan.asOf} · 未来 {futureCount} 个桶
          </p>
        </div>
      </div>
      <p className="mb-rp-flow-note">
        该视图未来区间只展示「预测 · 预算计划」；后端没有 actual / planned / committed 分项，
        因此不把真实与预测相加成合计，也不做跨桶额度合计。
      </p>
      <div className="mb-rp-flow-buckets">
        {rows.map(({ point, state, actual: actualBucket }) => (
          <BucketSection
            key={point.start}
            point={point}
            state={state}
            actual={actualBucket}
            asOf={plan.asOf}
          />
        ))}
      </div>
      <p className="mb-rp-flow-footnote">
        每个金额都直接取后端字段；已发生来自历史收支报表的逐桶 actual，预算计划来自
        period-plan 的 occurrence。分段只做展示，前端不做任何相加。
      </p>
    </Card>
  )
}
