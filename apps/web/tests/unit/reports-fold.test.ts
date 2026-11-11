import { describe, expect, it } from 'vitest'
import { cashRowsFor, type CashGroup } from '@/features/reports/reportsModel'

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
  it('默认全部折叠：两表都只显示分组行', () => {
    expect(cashRowsFor('in', groups(), {}, () => {})).toHaveLength(1)
    expect(cashRowsFor('out', groups(), {}, () => {})).toHaveLength(1)
  })

  it('展开左侧流入分组后，右侧流出行数不变', () => {
    const expanded = { 'in:经营': true }
    const inflow = cashRowsFor('in', groups(), expanded, () => {})
    const outflow = cashRowsFor('out', groups(), expanded, () => {})

    expect(inflow).toHaveLength(3)
    expect(outflow).toHaveLength(1)
  })
})
