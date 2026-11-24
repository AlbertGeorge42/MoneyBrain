/**
 * 流水筛选参数映射单测（API 接入）
 *
 * 断言前端筛选 → /transactions 参数的映射：
 * categoryIds 展开为重复 categoryId、金额元 → 分、期间/类型/账户/关键词直传。
 */
import { describe, expect, it } from 'vitest'
import type { Transaction } from '@contracts/types'
import { createTestLedger } from '@/test-fixtures/ledger'
import { toLedgerTransaction } from '@/features/overview/apiLedger'
import { buildTransactionQueryParams } from '@/features/transactions/apiTransactions'
import { EMPTY_ADVANCED, type TransactionFilters } from '@/features/transactions/filters'

const apiLedger = createTestLedger()

const filters: TransactionFilters = {
  query: ' 咖啡 ',
  type: 'expense',
  advanced: {
    ...EMPTY_ADVANCED,
    accountId: 'acc-1',
    categoryIds: ['real-food', 'real-other'],
    amountMin: '10',
    amountMax: '99.5',
    dateFrom: '2026-10-01',
    dateTo: '2026-10-31',
  },
}

describe('buildTransactionQueryParams', () => {
  it('把合并分类映射成重复 categoryId，并直传其余筛选', () => {
    const params = buildTransactionQueryParams(filters, apiLedger, 1, 50)

    expect(params.getAll('categoryId')).toEqual(['real-food', 'real-other'])
    expect(params.get('type')).toBe('expense')
    expect(params.get('accountId')).toBe('acc-1')
    expect(params.get('keyword')).toBe('咖啡')
    expect(params.get('from')).toBe('2026-10-01')
    expect(params.get('to')).toBe('2026-10-31')
    expect(params.get('amountMin')).toBe('1000')
    expect(params.get('amountMax')).toBe('9950')
    expect(params.get('page')).toBe('1')
    expect(params.get('pageSize')).toBe('50')
  })

  it('单个根分类时只传一个 categoryId', () => {
    const single: TransactionFilters = {
      query: '',
      type: 'all',
      advanced: { ...EMPTY_ADVANCED, categoryId: 'real-food' },
    }
    const params = buildTransactionQueryParams(single, apiLedger, 2)
    expect(params.getAll('categoryId')).toEqual(['real-food'])
    expect(params.get('type')).toBeNull()
    expect(params.get('keyword')).toBeNull()
    expect(params.get('page')).toBe('2')
  })

})

describe('DTO → LedgerTransaction', () => {
  it('分类 id 用真实 id，日期与金额按适配口径映射', () => {
    const dto = {
      id: 'tx-1',
      type: 'expense',
      amount: 1234,
      date: '2026-10-20T00:00:00.000Z',
      accountId: 'acc-1',
      categoryId: 'real-food',
      note: '咖啡',
      fee: 0,
    } as unknown as Transaction
    const mapped = toLedgerTransaction(dto)
    expect(mapped.categoryId).toBe('real-food')
    expect(mapped.date).toBe('2026-10-20')
    expect(mapped.amount).toBe(1234)
  })
})
