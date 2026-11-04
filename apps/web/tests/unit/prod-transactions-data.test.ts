import { describe, expect, it } from 'vitest'
import type { Account as ApiAccount, Transaction as ApiTransaction, TransactionCategory as ApiCategory } from '@contracts/types'
import {
  toApiTransactionPayload,
  toHfAccounts,
  toHfCategories,
  toHfTransactions,
} from '../../src/features/transactions/transactions-data'

const transaction = {
  id: 'tx-1',
  type: 'expense',
  amount: -2850,
  fee: 0,
  coupon: 0,
  date: '2026-11-05T00:00:00.000Z',
  note: '晚饭',
  accountId: 'acc-1',
  categoryId: 'cat-food',
  toAccountId: null,
  category: { id: 'cat-food', name: '餐饮' },
} as unknown as ApiTransaction

const account = {
  id: 'acc-1',
  name: '现金',
  type: 'cash',
  category: { id: 'ac-1', name: '现金等价' },
} as unknown as ApiAccount

const category = {
  id: 'cat-food',
  name: '餐饮',
  type: 'expense',
  icon: 'utensils',
  parentId: null,
} as unknown as ApiCategory

describe('transactions-data', () => {
  it('把 API 分转成 HF 元，并保留支出负号', () => {
    const [hf] = toHfTransactions([transaction])
    expect(hf.amount).toBe(-28.5)
    expect(hf.type).toBe('expense')
    expect(hf.categoryId).toBe('cat-food')
    expect(hf.date).toBe('2026-11-05')
  })

  it('空账本返回空数组，不造数据', () => {
    expect(toHfTransactions(undefined)).toEqual([])
    expect(toHfAccounts(undefined)).toEqual([])
    expect(toHfCategories(undefined)).toEqual([])
  })

  it('账户分类映射为展示分组', () => {
    expect(toHfAccounts([account])).toEqual([{ id: 'acc-1', name: '现金', group: '现金等价' }])
  })

  it('分类映射类型与图标，父子分类都可用于记账', () => {
    const parent = { ...category, id: 'cat-parent', name: '生活' } as unknown as ApiCategory
    const child = { ...category, parentId: 'cat-parent' } as unknown as ApiCategory
    const mapped = toHfCategories([parent, child])
    expect(mapped).toHaveLength(2)
    const hf = mapped[0]
    expect(hf.types).toContain('expense')
    expect(hf.icon).toBe('utensils')
  })

  it('写入载荷转回分并保持符号；转账不带分类', () => {
    const hf = toHfTransactions([transaction])[0]
    const payload = toApiTransactionPayload(hf)
    expect(payload.amount).toBe(-2850)
    expect(payload.type).toBe('expense')
    expect(payload.categoryId).toBe('cat-food')

    const transfer = toApiTransactionPayload({
      ...hf,
      type: 'transfer',
      toAccountId: 'acc-2',
      amount: -100,
    })
    expect(transfer.categoryId).toBeUndefined()
    expect(transfer.toAccountId).toBe('acc-2')
    expect(transfer.amount).toBe(-10000)
  })
})
