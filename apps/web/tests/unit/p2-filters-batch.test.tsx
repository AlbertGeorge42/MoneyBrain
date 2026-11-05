/**
 * P2 #8 / #11 筛选写入 URL 并还原；#17 批量混选列出异类。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BatchBar } from '@/features/transactions/BatchBar'
import {
  EMPTY_ADVANCED,
  filterTransactions,
  readFiltersFromSearch,
  writeFiltersToSearch,
  type TransactionFilters,
} from '@/features/transactions/filters'
import type { Ledger } from '@/features/overview/model'

const ledger: Ledger = {
  accounts: [{ id: 'cmb', name: '招商储蓄卡', kind: 'deposit', balance: 100_000 }],
  categories: [
    { id: 'food', name: '餐饮', type: 'expense' },
    { id: 'food_lunch', name: '午餐', type: 'expense', parentId: 'food' },
    { id: 'other', name: '其他', type: 'expense' },
  ],
  budgets: [],
  transactions: [
    { id: 't1', date: '2026-10-05', type: 'expense', categoryId: 'food_lunch', note: '午餐', accountId: 'cmb', amount: 2_000 },
    { id: 't2', date: '2026-10-20', type: 'expense', categoryId: 'other', note: '对账', accountId: 'cmb', amount: 240 },
    { id: 't3', date: '2026-09-10', type: 'expense', categoryId: 'other', note: '上期', accountId: 'cmb', amount: 3_000 },
  ],
}

describe('#8 / #11 筛选写入 URL 并还原', () => {
  const filters: TransactionFilters = {
    query: '',
    type: 'all',
    advanced: {
      ...EMPTY_ADVANCED,
      categoryIds: ['other'],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
    },
  }

  it('往返保留分类 + 期间，且不覆盖预览壳参数', () => {
    const search = writeFiltersToSearch('?page=transactions&device=desktop', filters)
    const params = new URLSearchParams(search)
    expect(params.get('page')).toBe('transactions')
    expect(params.get('device')).toBe('desktop')

    const restored = readFiltersFromSearch(search, ledger)
    expect(restored.filters.advanced.categoryIds).toEqual(['other'])
    expect(restored.filters.advanced.dateFrom).toBe('2026-10-01')
    expect(restored.filters.advanced.dateTo).toBe('2026-10-31')
    expect(restored.dropped).toEqual([])
  })

  it('还原后的筛选只命中对应分类与期间', () => {
    const restored = readFiltersFromSearch(writeFiltersToSearch('', filters), ledger)
    const matched = filterTransactions(ledger, restored.filters)
    expect(matched.map((item) => item.id)).toEqual(['t2'])
  })

  it('无法还原的条件进入 dropped，不静默清空', () => {
    const restored = readFiltersFromSearch('?txCategory=missing&txFrom=bad', ledger)
    expect(restored.dropped).toEqual(['分类', '起始日期'])
  })
})

describe('#17 批量混选列出异类', () => {
  it('列出被排除的记录并提供「仅选支出」', () => {
    const onExpenseOnly = vi.fn()
    render(
      <BatchBar
        device="desktop"
        count={3}
        excluded={[
          { id: 't9', label: '工资', reason: '收入' },
          { id: 't10', label: '账户互转', reason: '转账' },
        ]}
        categoryDisabled
        categoryHint="含转账 / 退款 / 调整，或混选收支类型，不能批量改分类"
        onCategory={() => {}}
        onDelete={() => {}}
        onSelectExpenseOnly={onExpenseOnly}
        onExit={() => {}}
      />,
    )

    expect(screen.getByText(/已排除：工资（收入）、账户互转（转账）/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '仅选支出' }))
    expect(onExpenseOnly).toHaveBeenCalledTimes(1)
  })
})
