import { describe, it, expect } from 'vitest'
import { resolveAccountCategoryFlags } from '../../src/services/account-category-flags.js'

describe('resolveAccountCategoryFlags', () => {
  it('根节点开启现金等价，子节点继承', () => {
    const flags = resolveAccountCategoryFlags([
      { id: 'root-cash', parentId: null, isCashEquivalent: true, isInvestment: false },
      { id: 'child-1', parentId: 'root-cash', isCashEquivalent: false, isInvestment: false },
      { id: 'child-2', parentId: 'root-cash', isCashEquivalent: false, isInvestment: false },
    ])
    expect(flags.cashCategoryIds).toContain('root-cash')
    expect(flags.cashCategoryIds).toContain('child-1')
    expect(flags.cashCategoryIds).toContain('child-2')
    expect(flags.effectiveFlags.get('child-1')!.isCashEquivalent).toBe(true)
  })

  it('根节点关闭，子节点不能自行开启', () => {
    const flags = resolveAccountCategoryFlags([
      { id: 'root-asset', parentId: null, isCashEquivalent: false, isInvestment: false },
      { id: 'child', parentId: 'root-asset', isCashEquivalent: true, isInvestment: false },
    ])
    expect(flags.cashCategoryIds).not.toContain('child')
    expect(flags.effectiveFlags.get('child')!.isCashEquivalent).toBe(false)
  })

  it('根节点开启，子节点历史值为 false 仍继承根节点', () => {
    const flags = resolveAccountCategoryFlags([
      { id: 'root', parentId: null, isCashEquivalent: true, isInvestment: false },
      { id: 'child', parentId: 'root', isCashEquivalent: false, isInvestment: false },
      { id: 'grandchild', parentId: 'child', isCashEquivalent: false, isInvestment: false },
    ])
    expect(flags.effectiveFlags.get('grandchild')!.isCashEquivalent).toBe(true)
  })

  it('根节点关闭，子节点历史值为 true 仍继承根节点（不污染）', () => {
    const flags = resolveAccountCategoryFlags([
      { id: 'root', parentId: null, isCashEquivalent: false, isInvestment: false },
      { id: 'child', parentId: 'root', isCashEquivalent: true, isInvestment: false },
    ])
    expect(flags.effectiveFlags.get('child')!.isCashEquivalent).toBe(false)
  })

  it('多层级继承', () => {
    const flags = resolveAccountCategoryFlags([
      { id: 'root', parentId: null, isCashEquivalent: true, isInvestment: true },
      { id: 'l2', parentId: 'root', isCashEquivalent: false, isInvestment: false },
      { id: 'l3', parentId: 'l2', isCashEquivalent: false, isInvestment: false },
      { id: 'l4', parentId: 'l3', isCashEquivalent: false, isInvestment: false },
    ])
    expect(flags.effectiveFlags.get('l4')!.isCashEquivalent).toBe(true)
    expect(flags.effectiveFlags.get('l4')!.isInvestment).toBe(true)
    expect(flags.investmentCategoryIds).toContain('l4')
  })

  it('多个独立根节点，各自属性互不干扰', () => {
    const flags = resolveAccountCategoryFlags([
      { id: 'cash-root', parentId: null, isCashEquivalent: true, isInvestment: false },
      { id: 'invest-root', parentId: null, isCashEquivalent: false, isInvestment: true },
      { id: 'asset-root', parentId: null, isCashEquivalent: false, isInvestment: false },
      { id: 'cash-child', parentId: 'cash-root', isCashEquivalent: false, isInvestment: false },
      { id: 'invest-child', parentId: 'invest-root', isCashEquivalent: false, isInvestment: false },
    ])
    expect(flags.cashCategoryIds).toEqual(new Set(['cash-root', 'cash-child']))
    expect(flags.investmentCategoryIds).toEqual(new Set(['invest-root', 'invest-child']))
  })

  it('空分类树', () => {
    const flags = resolveAccountCategoryFlags([])
    expect(flags.cashCategoryIds.size).toBe(0)
    expect(flags.investmentCategoryIds.size).toBe(0)
    expect(flags.effectiveFlags.size).toBe(0)
  })

  it('孤立节点（parentId 指向不存在的 id）使用自身值', () => {
    const flags = resolveAccountCategoryFlags([
      { id: 'orphan', parentId: 'nonexistent', isCashEquivalent: true, isInvestment: false },
    ])
    expect(flags.effectiveFlags.get('orphan')!.isCashEquivalent).toBe(true)
    expect(flags.cashCategoryIds).toContain('orphan')
  })

  it('isCashEquivalent 与 isInvestment 两个属性独立传播', () => {
    const flags = resolveAccountCategoryFlags([
      { id: 'both', parentId: null, isCashEquivalent: true, isInvestment: true },
      { id: 'cash-only', parentId: null, isCashEquivalent: true, isInvestment: false },
      { id: 'invest-only', parentId: null, isCashEquivalent: false, isInvestment: true },
      { id: 'child-cash-only', parentId: 'cash-only', isCashEquivalent: false, isInvestment: true },
    ])
    expect(flags.effectiveFlags.get('child-cash-only')!.isCashEquivalent).toBe(true)
    expect(flags.effectiveFlags.get('child-cash-only')!.isInvestment).toBe(false)
  })
})
