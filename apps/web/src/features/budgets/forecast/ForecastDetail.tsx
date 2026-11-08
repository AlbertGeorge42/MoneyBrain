/**
 * 选中月明细：只回显后端字段。
 *
 * covered[] 只做解释（该预算点位已被真实交易覆盖、已从 planned 剔除），不参与任何合计；
 * 预算额度 totals 直接展示，不在这里做实际支出 + 计划 的合并。
 */
import type { ProjectionBalance, ProjectionCoveredOccurrence, ProjectionFlowValue } from '@contracts/types'
import { formatCurrency } from '@/utils/format'
import { monthText, type ForecastPoint, type ForecastTab } from './model'

interface ForecastDetailProps {
  tab: ForecastTab
  point: ForecastPoint
}

function FlowRow({ label, flow }: { label: string; flow: ProjectionFlowValue }) {
  return (
    <div className="mb-fc-detail-row">
      <dt>{label}</dt>
      <dd>
        <span>已发生 {formatCurrency(flow.actual)}</span>
        <span>按预算计划 {formatCurrency(flow.planned)}</span>
        <span>已排定 {formatCurrency(flow.committed)}</span>
        <span className="mb-fc-detail-total">接口合计 {formatCurrency(flow.total)}</span>
      </dd>
    </div>
  )
}

function BalanceRow({ label, balance }: { label: string; balance: ProjectionBalance }) {
  return (
    <div className="mb-fc-detail-row">
      <dt>{label}</dt>
      <dd>
        <span>资产 {formatCurrency(balance.assets)}</span>
        <span>负债 {formatCurrency(balance.liabilities)}</span>
        <span className="mb-fc-detail-total">净资产 {formatCurrency(balance.netWorth)}</span>
      </dd>
    </div>
  )
}

function CoveredBlock({ covered }: { covered: ProjectionCoveredOccurrence[] }) {
  if (covered.length === 0) return null
  return (
    <div className="mb-fc-covered">
      <p className="mb-fc-covered-title">本月这笔已按真实交易计入，不重复推算</p>
      <ul className="mb-fc-covered-list">
        {covered.map((item) => (
          <li key={`${item.budgetId}-${item.date}-${item.transactionId}`}>
            {item.budgetName} · 预算日 {item.date} · 真实交易 {item.transactionDate} · 被剔除计划金额{' '}
            {formatCurrency(item.amount)}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ForecastDetail({ tab, point }: ForecastDetailProps) {
  const plan = point.plan
  return (
    <div className="mb-fc-detail">
      <div className="mb-fc-detail-head">
        <strong>{monthText(point.label)}</strong>
        <span className="mb-fc-detail-badge">
          {plan?.hasBudget ? '已设预算' : plan ? '未设预算' : '数据未就绪'}
        </span>
      </div>

      {tab === 'cash' ? (
        point.cash ? (
          <dl className="mb-fc-detail-list">
            <div className="mb-fc-detail-row">
              <dt>期初现金</dt>
              <dd>{formatCurrency(point.cash.startCash)}</dd>
            </div>
            <FlowRow label="流入" flow={point.cash.inflow} />
            <FlowRow label="流出" flow={point.cash.outflow} />
            <FlowRow label="净额" flow={point.cash.net} />
            <div className="mb-fc-detail-row">
              <dt>期末现金</dt>
              <dd className="mb-fc-detail-total">{formatCurrency(point.cash.endCash)}</dd>
            </div>
          </dl>
        ) : (
          <p className="mb-fc-detail-empty">该月数据未就绪</p>
        )
      ) : point.asset ? (
        <dl className="mb-fc-detail-list">
          <BalanceRow label="实际基准" balance={point.asset.actual} />
          <BalanceRow label="按预算计划（累计）" balance={point.asset.planned} />
          <BalanceRow label="已排定（累计）" balance={point.asset.committed} />
          <BalanceRow label="接口合计" balance={point.asset.total} />
        </dl>
      ) : (
        <p className="mb-fc-detail-empty">该月数据未就绪</p>
      )}

      {plan?.hasBudget && plan.totals && (
        <p className="mb-fc-detail-budget">
          本月预算额度：收入 {formatCurrency(plan.totals.income)} · 支出 {formatCurrency(plan.totals.expense)} ·
          转账 {formatCurrency(plan.totals.transfer)}
        </p>
      )}

      {point.cash && <CoveredBlock covered={point.cash.covered} />}
      {point.asset && <CoveredBlock covered={point.asset.covered} />}
    </div>
  )
}
