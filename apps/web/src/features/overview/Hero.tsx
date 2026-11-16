import { amountText, percentText } from './format'
import type { OverviewSummary } from './model'

function Trend({ value, tone = 'pos' }: { value: number; tone?: 'pos' | 'neg' }) {
  const up = value >= 0
  return (
    <span className={`mb-ov-hero-delta --${tone}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      较上月 {percentText(value)}
    </span>
  )
}

export function NetWorthHero({ summary }: { summary: OverviewSummary }) {
  const positive = summary.balance >= 0
  return (
    <section className="mb-ov-hero" aria-labelledby="mb-ov-hero-label">
      <div className="mb-ov-hero-head">
        <span id="mb-ov-hero-label" className="mb-ov-hero-label">
          净资产
        </span>
        <span className={summary.netWorthChangePct >= 0 ? 'mb-ov-change mb-ov-change--pos' : 'mb-ov-change mb-ov-change--neg'}>
          较上月 {percentText(summary.netWorthChangePct)}
        </span>
      </div>
      <div className="mb-ov-worth">{amountText(summary.netWorth)}</div>
      <div className="mb-ov-hero-meta">
        现金等价 {amountText(summary.liquidAssets)} · 投资账户 {amountText(summary.investmentAssets)}
      </div>
      <div className="mb-ov-hero-grid">
        <div className="mb-ov-cell">
          <span className="mb-ov-cell-label">本月收入</span>
          <strong className="mb-ov-cell-value mb-ov-cell-value--pos">{amountText(summary.income)}</strong>
          <Trend value={summary.incomeChangePct} />
        </div>
        <div className="mb-ov-cell">
          <span className="mb-ov-cell-label">本月支出</span>
          <strong className="mb-ov-cell-value mb-ov-cell-value--neg">−{amountText(summary.expense)}</strong>
          <Trend value={summary.expenseChangePct} tone="neg" />
        </div>
        <div className="mb-ov-cell">
          <span className="mb-ov-cell-label">本月结余</span>
          <strong className={positive ? 'mb-ov-cell-value mb-ov-cell-value--pos' : 'mb-ov-cell-value mb-ov-cell-value--neg'}>
            {amountText(summary.balance, { showSign: positive })}
          </strong>
        </div>
        <div className="mb-ov-cell">
          <span className="mb-ov-cell-label">储蓄率</span>
          <strong className="mb-ov-cell-value">{percentText(summary.savingsRate, false)}</strong>
        </div>
      </div>
    </section>
  )
}

export function MobileHero({ summary }: { summary: OverviewSummary }) {
  const positive = summary.balance >= 0
  return (
    <section className="mb-ov-hero is-mobile" aria-labelledby="mb-hero-label-mobile">
      <div className="mb-ov-hero-head">
        <span id="mb-hero-label-mobile" className="mb-ov-hero-label">
          净资产
        </span>
        <span className={summary.netWorthChangePct >= 0 ? 'mb-ov-change mb-ov-change--pos' : 'mb-ov-change mb-ov-change--neg'}>
          较上月 {percentText(summary.netWorthChangePct)}
        </span>
      </div>
      <div className="mb-ov-worth">{amountText(summary.netWorth)}</div>
      <div className="mb-ov-hero-meta">
        现金等价 {amountText(summary.liquidAssets)} · 投资 {amountText(summary.investmentAssets)}
      </div>
      <div className="mb-ov-inline">
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
    <div className="mb-ov-snapshots">
      <section className="mb-ov-snapshot">
        <span className="mb-ov-snapshot-label">本月收入</span>
        <strong className="mb-ov-value mb-ov-value--income">{amountText(summary.income)}</strong>
        <Trend value={summary.incomeChangePct} />
      </section>
      <section className="mb-ov-snapshot">
        <span className="mb-ov-snapshot-label">本月支出</span>
        <strong className="mb-ov-value mb-ov-value--expense">−{amountText(summary.expense)}</strong>
        <Trend value={summary.expenseChangePct} tone="neg" />
      </section>
    </div>
  )
}
