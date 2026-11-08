/**
 * 流水筛选参数映射单测（API 接入）
 *
 * 断言前端筛选 → /transactions 参数的映射：
 * categoryIds 展开为重复 categoryId、金额元 → 分、期间/类型/账户/关键词直传。
 */
import { describe, expect, it } from 'vitest'
import type { Transaction, TransactionCategory } from '@contracts/types'
import { createSeedLedger } from '@/dev-fixtures/seed'
import {
  createCategoryDisplayMapper,
  toLedgerTransaction,
} from '@/features/overview/apiLedger'
import { buildTransactionQueryParams } from '@/features/transactions/apiTransactions'
import { EMPTY_ADVANCED, type TransactionFilters } from '@/features/transactions/filters'

function category(
  id: string,
  name: string,
  parentId: string | null = null,
  type = 'expense',
): TransactionCategory {
  return {
    id,
    name,
    type,
    parentId,
    sort: 0,
    parent: null,
    children: [],
    cashFlowType: null,
    createdAt: '',
    updatedAt: '',
  }
}

const apiLedger = {
  ...createSeedLedger(),
  ids: {
    categoryReal: { food: 'real-food', other: 'real-other' },
    categoryDisplay: { 'real-food': 'food', 'real-other': 'other' },
  },
}

const filters: TransactionFilters = {
  query: ' 咖啡 ',
  type: 'expense',
  advanced: {
    ...EMPTY_ADVANCED,
    accountId: 'acc-1',
    categoryIds: ['food', 'other'],
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
      advanced: { ...EMPTY_ADVANCED, categoryId: 'food' },
    }
    const params = buildTransactionQueryParams(single, apiLedger, 2)
    expect(params.getAll('categoryId')).toEqual(['real-food'])
    expect(params.get('type')).toBeNull()
    expect(params.get('keyword')).toBeNull()
    expect(params.get('page')).toBe('2')
  })

  it('没有映射时原样传递 id（种子账本）', () => {
    const seedFilters: TransactionFilters = {
      query: '',
      type: 'income',
      advanced: { ...EMPTY_ADVANCED, categoryId: 'salary' },
    }
    const params = buildTransactionQueryParams(seedFilters, createSeedLedger(), 1)
    expect(params.getAll('categoryId')).toEqual(['salary'])
  })
})

describe('分类展示映射', () => {
  it('种子同名根分类映射为种子 key，并可反查真实 id', () => {
    const mapper = createCategoryDisplayMapper([category('real-food', '餐饮')])
    expect(mapper.displayId('real-food')).toBe('food')
    expect(mapper.realId('food')).toBe('real-food')
    expect(mapper.realId('child-id')).toBe('child-id')
  })

  it('同名根分类只映射第一个，避免展示 id 撞车', () => {
    const mapper = createCategoryDisplayMapper([
      category('real-other-expense', '其他', null, 'expense'),
      category('real-other-income', '其他', null, 'income'),
    ])
    expect(mapper.displayId('real-other-expense')).toBe('other')
    expect(mapper.displayId('real-other-income')).toBe('real-other-income')
  })

  it('DTO → LedgerTransaction 使用展示 id', () => {
    const mapper = createCategoryDisplayMapper([category('real-food', '餐饮')])
    const dto = {
      id: 'tx-1',
      type: 'expense',
      ruleVersion: 1,
      amount: 1234,
      date: '2026-10-20T00:00:00.000Z',
      accountId: 'acc-1',
      categoryId: 'real-food',
      note: '咖啡',
      fee: 0,
    } as unknown as Transaction
    const mapped = toLedgerTransaction(dto, mapper)
    expect(mapped.categoryId).toBe('food')
    expect(mapped.date).toBe('2026-10-20')
    expect(mapped.amount).toBe(1234)
  })
})
