import { amountText, percentText } from './format'
import type { OverviewSummary } from './model'

function Trend({ value, tone = 'pos' }: { value: number; tone?: 'pos' | 'neg' }) {
  const up = value >= 0
  return (
    <span className={`mb-hero-delta is-${tone}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      较上月 {percentText(value)}
    </span>
  )
}

export function NetWorthHero({ summary }: { summary: OverviewSummary }) {
  const positive = summary.balance >= 0
  return (
    <section className="mb-hero" aria-labelledby="mb-hero-label">
      <div className="mb-hero-head">
        <span id="mb-hero-label" className="mb-hero-label">
          净资产
        </span>
        <span className={summary.netWorthChangePct >= 0 ? 'mb-hero-change is-pos' : 'mb-hero-change is-neg'}>
          较上月 {percentText(summary.netWorthChangePct)}
        </span>
      </div>
      <div className="mb-hero-worth">{amountText(summary.netWorth)}</div>
      <div className="mb-hero-meta">
        现金等价 {amountText(summary.liquidAssets)} · 投资账户 {amountText(summary.investmentAssets)}
      </div>
      <div className="mb-hero-grid">
        <div className="mb-hero-cell">
          <span className="mb-hero-cell-label">本月收入</span>
          <strong className="mb-hero-cell-value is-pos">{amountText(summary.income)}</strong>
          <Trend value={summary.incomeChangePct} />
        </div>
        <div className="mb-hero-cell">
          <span className="mb-hero-cell-label">本月支出</span>
          <strong className="mb-hero-cell-value is-neg">−{amountText(summary.expense)}</strong>
          <Trend value={summary.expenseChangePct} tone="neg" />
        </div>
        <div className="mb-hero-cell">
          <span className="mb-hero-cell-label">本月结余</span>
          <strong className={positive ? 'mb-hero-cell-value is-pos' : 'mb-hero-cell-value is-neg'}>
            {amountText(summary.balance, { showSign: positive })}
          </strong>
        </div>
        <div className="mb-hero-cell">
          <span className="mb-hero-cell-label">储蓄率</span>
          <strong className="mb-hero-cell-value">{percentText(summary.savingsRate, false)}</strong>
        </div>
      </div>
    </section>
  )
}

export function MobileHero({ summary }: { summary: OverviewSummary }) {
  const positive = summary.balance >= 0
  return (
    <section className="mb-hero is-mobile" aria-labelledby="mb-hero-label-mobile">
      <div className="mb-hero-head">
        <span id="mb-hero-label-mobile" className="mb-hero-label">
          净资产
        </span>
        <span className={summary.netWorthChangePct >= 0 ? 'mb-hero-change is-pos' : 'mb-hero-change is-neg'}>
          较上月 {percentText(summary.netWorthChangePct)}
        </span>
      </div>
      <div className="mb-hero-worth">{amountText(summary.netWorth)}</div>
      <div className="mb-hero-meta">
        现金等价 {amountText(summary.liquidAssets)} · 投资 {amountText(summary.investmentAssets)}
      </div>
      <div className="mb-hero-inline">
        <span>
          本月结余{' '}
          <strong className={positive ? 'is-pos' : 'is-neg'}>
            {amountText(summary.balance, { showSign: positive })}
          </strong>
        </span>
        <span>
          储蓄率 <strong>{percentText(summary.savingsRate, false)}</strong>
        </span>
      </div>
    </section>
  )
}

export function MobileSnapshots({ summary }: { summary: OverviewSummary }) {
  return (
    <div className="mb-m-snapshots">
      <section className="mb-snapshot">
        <span className="mb-snapshot-label">本月收入</span>
        <strong className="mb-snapshot-value is-income">{amountText(summary.income)}</strong>
        <Trend value={summary.incomeChangePct} />
      </section>
      <section className="mb-snapshot">
        <span className="mb-snapshot-label">本月支出</span>
        <strong className="mb-snapshot-value is-expense">−{amountText(summary.expense)}</strong>
        <Trend value={summary.expenseChangePct} tone="neg" />
      </section>
    </div>
  )
}
