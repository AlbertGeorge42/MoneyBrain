import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAccountCategoryFlags, resolveTransactionCategoryFlags } from '../src/index.js'

test('account flags：根节点开启现金等价，子节点继承', () => {
  const flags = resolveAccountCategoryFlags([
    { id: 'root-cash', parentId: null, isCashEquivalent: true, isInvestment: false },
    { id: 'child-1', parentId: 'root-cash', isCashEquivalent: null, isInvestment: null },
    { id: 'child-2', parentId: 'root-cash', isCashEquivalent: null, isInvestment: null },
  ])
  assert.equal(flags.cashCategoryIds.has('root-cash'), true)
  assert.equal(flags.cashCategoryIds.has('child-1'), true)
  assert.equal(flags.cashCategoryIds.has('child-2'), true)
  assert.equal(flags.effectiveFlags.get('child-1')!.isCashEquivalent, true)
})

test('account flags：根节点关闭，子分类不能自行开启（历史脏值被忽略）', () => {
  const flags = resolveAccountCategoryFlags([
    { id: 'root-asset', parentId: null, isCashEquivalent: false, isInvestment: false },
    { id: 'child', parentId: 'root-asset', isCashEquivalent: true, isInvestment: true },
  ])
  assert.equal(flags.cashCategoryIds.has('child'), false)
  assert.equal(flags.effectiveFlags.get('child')!.isCashEquivalent, false)
  assert.equal(flags.effectiveFlags.get('child')!.isInvestment, false)
})

test('account flags：多层继承，两个属性独立传播', () => {
  const flags = resolveAccountCategoryFlags([
    { id: 'root', parentId: null, isCashEquivalent: true, isInvestment: true },
    { id: 'l2', parentId: 'root', isCashEquivalent: null, isInvestment: null },
    { id: 'l3', parentId: 'l2', isCashEquivalent: null, isInvestment: null },
  ])
  assert.equal(flags.effectiveFlags.get('l3')!.isCashEquivalent, true)
  assert.equal(flags.effectiveFlags.get('l3')!.isInvestment, true)
  assert.equal(flags.investmentCategoryIds.has('l3'), true)
})

test('account flags：多个独立根、空树、孤立节点', () => {
  const multi = resolveAccountCategoryFlags([
    { id: 'cash-root', parentId: null, isCashEquivalent: true, isInvestment: false },
    { id: 'invest-root', parentId: null, isCashEquivalent: false, isInvestment: true },
    { id: 'cash-child', parentId: 'cash-root', isCashEquivalent: null, isInvestment: null },
  ])
  assert.deepEqual([...multi.cashCategoryIds], ['cash-root', 'cash-child'])
  assert.deepEqual([...multi.investmentCategoryIds], ['invest-root'])
  const empty = resolveAccountCategoryFlags([])
  assert.equal(empty.cashCategoryIds.size, 0)
  const orphan = resolveAccountCategoryFlags([
    { id: 'orphan', parentId: 'nonexistent', isCashEquivalent: true, isInvestment: false },
  ])
  assert.equal(orphan.effectiveFlags.get('orphan')!.isCashEquivalent, true)
})

test('tx flags：根 operating，子分类脏值被忽略、null 继承', () => {
  const { effectiveCashFlowTypes } = resolveTransactionCategoryFlags([
    { id: 'root', parentId: null, cashFlowType: 'operating' },
    { id: 'child', parentId: 'root', cashFlowType: 'investing' },
    { id: 'grandchild', parentId: 'child', cashFlowType: null },
  ])
  assert.equal(effectiveCashFlowTypes.get('child'), 'operating')
  assert.equal(effectiveCashFlowTypes.get('grandchild'), 'operating')
})

test('tx flags：根 null 时整棵子树为 null，多根互不干扰，孤立节点兜底', () => {
  const nullRoot = resolveTransactionCategoryFlags([
    { id: 'root', parentId: null, cashFlowType: null },
    { id: 'child', parentId: 'root', cashFlowType: 'operating' },
  ])
  assert.equal(nullRoot.effectiveCashFlowTypes.get('child'), null)
  const multi = resolveTransactionCategoryFlags([
    { id: 'op', parentId: null, cashFlowType: 'operating' },
    { id: 'inv', parentId: null, cashFlowType: 'investing' },
    { id: 'nested', parentId: 'op', cashFlowType: 'financing' },
    { id: 'orphan', parentId: 'nonexistent', cashFlowType: 'financing' },
  ])
  assert.equal(multi.effectiveCashFlowTypes.get('nested'), 'operating')
  assert.equal(multi.effectiveCashFlowTypes.get('orphan'), 'financing')
  assert.equal(resolveTransactionCategoryFlags([]).effectiveCashFlowTypes.size, 0)
})
