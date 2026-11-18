import { describe, expect, it, vi } from 'vitest'
import { cashRowsFor, type CashGroup } from '@/features/reports/reportsModel'

function groups(): CashGroup[] {
  return [
    {
      key: '经营',
      name: '经营',
      total: 900,
      count: 2,
      children: [
        { id: 't1', label: '工资', account: '储蓄', amount: 800, tone: 'income', categoryId: 'salary' },
        { id: 't2', label: '红包', account: '微信零钱', amount: 100, tone: 'income', categoryId: 'gift' },
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

describe('现金流表格行与环图同口径下钻', () => {
  it('一级分组行与二级分类行都可点，构造同一个 DrillTarget', () => {
    const onDrill = vi.fn()
    const rows = cashRowsFor('in', groups(), { 'in:经营': true }, () => {}, onDrill)

    expect(rows.every((row) => Boolean(row.onOpen))).toBe(true)

    rows[0].onOpen?.()
    expect(onDrill).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'category',
        title: '经营',
        amountLabel: '所选期间流入',
        amount: 900,
        childTitle: '分类',
        ids: ['salary', 'gift'],
        side: 'income',
      }),
    )

    rows[1].onOpen?.()
    expect(onDrill).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: '工资',
        amount: 800,
        ids: ['salary'],
        children: [],
      }),
    )
  })

  it('折叠箭头与行点击互不干扰：无 onDrill 时行仍不可点', () => {
    const rows = cashRowsFor('in', groups(), {}, () => {})
    expect(rows[0].onOpen).toBeUndefined()
    expect(rows[0].fold?.expanded).toBe(false)
  })
})
