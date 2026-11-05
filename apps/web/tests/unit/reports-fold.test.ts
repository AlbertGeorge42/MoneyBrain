import { describe, expect, it } from 'vitest'
import { cashRowsFor } from '@/features/reports/ReportsPage'
import type { CashGroup } from '@/features/reports/reportsModel'

function groups(): CashGroup[] {
  return [
    {
      key: '经营',
      name: '经营',
      total: 900,
      count: 2,
      children: [
        { id: 't1', label: '工资', account: '储蓄', amount: 800, tone: 'income' },
        { id: 't2', label: '红包', account: '微信零钱', amount: 100, tone: 'income' },
      ],
    },
  ]
}

describe('现金流左右表折叠', () => {
  it('折左侧流入分组后，右侧流出行数不变', () => {
    const folded = { 'in:经营': false }
    const inflow = cashRowsFor('in', groups(), folded, () => {})
    const outflow = cashRowsFor('out', groups(), folded, () => {})

    expect(inflow).toHaveLength(1)
    expect(outflow).toHaveLength(3)
  })
})
