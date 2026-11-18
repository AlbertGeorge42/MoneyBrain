import { describe, it, expect } from 'vitest'
import { resolveTransactionCategoryFlags } from '../../src/services/transaction-category-flags.js'

describe('resolveTransactionCategoryFlags', () => {
  it('根节点 operating，子节点 null 继承为 operating', () => {
    const { effectiveCashFlowTypes } = resolveTransactionCategoryFlags([
      { id: 'root', parentId: null, cashFlowType: 'operating' },
      { id: 'child', parentId: 'root', cashFlowType: null },
    ])
    expect(effectiveCashFlowTypes.get('child')).toBe('operating')
  })

  it('根节点 operating，子节点 investing 历史脏值被忽略', () => {
    const { effectiveCashFlowTypes } = resolveTransactionCategoryFlags([
      { id: 'root', parentId: null, cashFlowType: 'operating' },
      { id: 'child', parentId: 'root', cashFlowType: 'investing' },
    ])
    expect(effectiveCashFlowTypes.get('child')).toBe('operating')
  })

  it('根节点 null，子节点 operating 历史脏值被忽略，继承为 null', () => {
    const { effectiveCashFlowTypes } = resolveTransactionCategoryFlags([
      { id: 'root', parentId: null, cashFlowType: null },
      { id: 'child', parentId: 'root', cashFlowType: 'operating' },
    ])
    expect(effectiveCashFlowTypes.get('child')).toBe(null)
  })

  it('根节点 financing，多层级后代全部继承', () => {
    const { effectiveCashFlowTypes } = resolveTransactionCategoryFlags([
      { id: 'root', parentId: null, cashFlowType: 'financing' },
      { id: 'l2', parentId: 'root', cashFlowType: null },
      { id: 'l3', parentId: 'l2', cashFlowType: 'operating' },
      { id: 'l4', parentId: 'l3', cashFlowType: null },
    ])
    expect(effectiveCashFlowTypes.get('l2')).toBe('financing')
    expect(effectiveCashFlowTypes.get('l3')).toBe('financing')
    expect(effectiveCashFlowTypes.get('l4')).toBe('financing')
  })

  it('多个独立根节点各自属性互不干扰', () => {
    const { effectiveCashFlowTypes } = resolveTransactionCategoryFlags([
      { id: 'op-root', parentId: null, cashFlowType: 'operating' },
      { id: 'inv-root', parentId: null, cashFlowType: 'investing' },
      { id: 'fin-root', parentId: null, cashFlowType: 'financing' },
      { id: 'nested', parentId: 'op-root', cashFlowType: 'investing' },
    ])
    expect(effectiveCashFlowTypes.get('op-root')).toBe('operating')
    expect(effectiveCashFlowTypes.get('inv-root')).toBe('investing')
    expect(effectiveCashFlowTypes.get('fin-root')).toBe('financing')
    expect(effectiveCashFlowTypes.get('nested')).toBe('operating')
  })

  it('空分类树', () => {
    const { effectiveCashFlowTypes } = resolveTransactionCategoryFlags([])
    expect(effectiveCashFlowTypes.size).toBe(0)
  })

  it('孤立节点（parentId 指向不存在的 id）使用自身 cashFlowType', () => {
    const { effectiveCashFlowTypes } = resolveTransactionCategoryFlags([
      { id: 'orphan', parentId: 'nonexistent', cashFlowType: 'operating' },
    ])
    expect(effectiveCashFlowTypes.get('orphan')).toBe('operating')
  })

  it('孤立节点 cashFlowType 为 null 时有效值为 null', () => {
    const { effectiveCashFlowTypes } = resolveTransactionCategoryFlags([
      { id: 'orphan', parentId: 'nonexistent', cashFlowType: null },
    ])
    expect(effectiveCashFlowTypes.get('orphan')).toBe(null)
  })
})
