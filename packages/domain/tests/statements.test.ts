import assert from 'node:assert/strict'
import test from 'node:test'
import { minor, sumAssetsLiabilities, sumPositiveAssets } from '../src/index.js'

// 领域计算引擎共享基座的迁移基线：固定输入 + 迁移前 API 实现的输出快照。
// 数值来自 apps/api/tests/unit/report-calc.test.ts（D0 迁入），不随实现调整；
// 这里只调用 Domain，不与旧实现做长期双实现对照。

test('资产负债汇总基线：负债账户负余额转为正数欠款', () => {
  const result = sumAssetsLiabilities(
    [
      { id: 'a1', type: 'asset' },
      { id: 'l1', type: 'liability' },
    ],
    (account) => minor(account.id === 'a1' ? 1000 : -300),
  )
  assert.deepEqual(result, { assets: 1000, liabilities: 300, netWorth: 700 })
})

test('资产负债汇总基线：多个负债账户先求和再取绝对值', () => {
  const result = sumAssetsLiabilities(
    [
      { id: 'a1', type: 'asset' },
      { id: 'l1', type: 'liability' },
      { id: 'l2', type: 'liability' },
    ],
    (account) => {
      if (account.id === 'a1') return minor(5000)
      if (account.id === 'l1') return minor(-2000)
      if (account.id === 'l2') return minor(-800)
      return minor(0)
    },
  )
  assert.deepEqual(result, { assets: 5000, liabilities: 2800, netWorth: 2200 })
})

test('资产负债汇总基线：负债超过资产时净资产为负', () => {
  const result = sumAssetsLiabilities(
    [
      { id: 'a1', type: 'asset' },
      { id: 'l1', type: 'liability' },
    ],
    (account) => minor(account.id === 'a1' ? 1000 : -5000),
  )
  assert.deepEqual(result, { assets: 1000, liabilities: 5000, netWorth: -4000 })
})

test('资产负债汇总基线：真实库正余额负债按资产减负债计算', () => {
  const result = sumAssetsLiabilities(
    [
      { id: 'a1', type: 'asset' },
      { id: 'l1', type: 'liability' },
      { id: 'l2', type: 'liability' },
    ],
    (account) => {
      if (account.id === 'a1') return minor(75474563)
      if (account.id === 'l1') return minor(1603015)
      return minor(0)
    },
  )
  assert.deepEqual(result, {
    assets: 75474563,
    liabilities: 1603015,
    netWorth: 73871548,
  })
})

test('资产负债汇总基线：无负债账户时净资产等于资产', () => {
  const result = sumAssetsLiabilities(
    [{ id: 'a1', type: 'asset' }],
    () => minor(123456),
  )
  assert.deepEqual(result, { assets: 123456, liabilities: 0, netWorth: 123456 })
})

test('正余额资产基线：排除负余额资产与负债账户', () => {
  const result = sumPositiveAssets(
    [
      { id: 'a1', type: 'asset' },
      { id: 'a2', type: 'asset' },
      { id: 'a3', type: 'asset' },
      { id: 'a4', type: 'asset' },
      { id: 'l1', type: 'liability' },
    ],
    (account) => {
      if (account.id === 'a1') return minor(82211079)
      if (account.id === 'a2') return minor(6046455)
      if (account.id === 'a3') return minor(-9016838)
      if (account.id === 'a4') return minor(2800)
      return minor(1603015)
    },
  )
  assert.equal(result, 88260334)
})

test('正余额资产基线：没有正余额资产时返回 0 避免除零', () => {
  const result = sumPositiveAssets(
    [{ id: 'a1', type: 'asset' }],
    () => minor(-100),
  )
  assert.equal(result, 0)
})
