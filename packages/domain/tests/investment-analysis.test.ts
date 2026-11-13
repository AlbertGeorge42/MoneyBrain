import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAllocationItems,
  buildSnapshotHistory,
  calculateMaxCapitalEmployed,
  calculateReturnMetrics,
  calculateTWR,
  calculateXIRR,
  mergeCategoryItems,
  minor,
  type AllocationItem,
  type AllocationSnapshot,
  type AllocationSnapshotItem,
  type InvestmentCashFlow,
  type LocalDate,
} from '../src/index.js'

// 投资分析算法的迁移基线：固定输入 + 迁移前实现的输出快照。
// 只调用 Domain，不与旧实现做长期双实现对照。

const day = (value: string): LocalDate => value as LocalDate
const stamp = (y: number, m: number, d: number, h = 0): number =>
  new Date(y, m - 1, d, h).getTime()

const flows: InvestmentCashFlow[] = [
  { day: day('2024-01-01'), timestamp: stamp(2024, 1, 1, 10), amount: minor(-1000000), kind: 'buy', accountId: 'a1' },
  { day: day('2024-03-01'), timestamp: stamp(2024, 3, 1, 10), amount: minor(-500000), kind: 'buy', accountId: 'a1' },
  { day: day('2024-06-01'), timestamp: stamp(2024, 6, 1, 10), amount: minor(300000), kind: 'sell', accountId: 'a1' },
  { day: day('2024-06-01'), timestamp: stamp(2024, 6, 1, 15), amount: minor(-200000), kind: 'buy', accountId: 'a1' },
]

const startMillis = stamp(2024, 1, 1)
const endMillis = stamp(2024, 12, 31)
const nextDayOfEnd = stamp(2025, 1, 1)

const balanceByDay: Record<string, number> = {
  '2024-01-01': 0,
  '2024-03-01': 1050000,
  '2024-06-01': 1580000,
  '2025-01-01': 1600000,
}

const balanceAt = (millis: number): number => {
  const value = new Date(millis)
  const key = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  return balanceByDay[key] ?? 0
}

test('XIRR 真实运行：CJS 默认导入互操作与数值结果', () => {
  // 第三方包是 CJS（module.exports），Domain 用 ESM 默认导入；这里验证真的跑通。
  assert.equal(calculateXIRR(10000, [], 11000, stamp(2024, 1, 1), stamp(2024, 12, 31)), 10)
  assert.equal(calculateXIRR(10000, [], 9000, stamp(2024, 1, 1), stamp(2024, 12, 31)) < 0, true)
  // 一年翻 100 倍触发 |rate| > 10 的收敛保护
  assert.equal(calculateXIRR(10000, [], 1000000, stamp(2024, 1, 1), stamp(2024, 12, 31)), null)
  // 全同号现金流：第三方或抛错（封装为 null）或收敛到负收益率
  const divergent = calculateXIRR(0, flows.slice(0, 2), 0, startMillis, endMillis)
  assert.equal(divergent === null || (typeof divergent === 'number' && divergent < 0), true)
})

test('XIRR 迁移基线：多笔现金流含同日双向', () => {
  assert.equal(calculateXIRR(0, flows, 1600000, startMillis, endMillis), 14.790316534886392)
})

test('收益指标迁移基线', () => {
  assert.equal(calculateMaxCapitalEmployed(flows, 0), 1500000)
  assert.deepEqual(calculateReturnMetrics(flows, minor(0), minor(1600000)), {
    periodInvested: 1700000,
    periodWithdrawn: 300000,
    netCashFlow: 1400000,
    periodReturn: 200000,
    simpleReturnRate: 0,
    maxCapitalEmployed: 1500000,
    cumulativeReturn: -400000,
    cumulativeReturnRate: -26.666666666666668,
  })
})

test('TWR 迁移基线：按日聚合、分段连乘与年化', () => {
  assert.deepEqual(calculateTWR({
    startMillis,
    endMillis: nextDayOfEnd,
    startValue: 0,
    cashFlows: flows,
    balanceAt,
  }), {
    twr: 15.710549258936357,
    annualizedTwr: 15.664425473284261,
  })
})

const categoryItems: AllocationItem[] = [
  {
    assetClassId: 'c1', name: '股票', marketValue: minor(900000), ratio: 60,
    targetRatio: 60, deviation: 0, rebalanceAmount: minor(0),
    periodInvested: minor(100000), periodWithdrawn: minor(0), periodReturn: minor(50000),
    returnRate: 5, sort: 1,
  },
  {
    assetClassId: 'c2', name: '债券', marketValue: minor(400000), ratio: 26.67,
    targetRatio: 40, deviation: -13.33, rebalanceAmount: minor(200000),
    periodInvested: minor(0), periodWithdrawn: minor(0), periodReturn: null,
    returnRate: null, sort: 2,
  },
  {
    assetClassId: 'c1', name: '股票', marketValue: minor(200000), ratio: 60,
    targetRatio: 55, deviation: 5, rebalanceAmount: minor(-10000),
    periodInvested: minor(0), periodWithdrawn: minor(5000), periodReturn: minor(12000),
    returnRate: 6, sort: 1,
  },
  {
    assetClassId: '__unclassified__', name: '未分类', marketValue: minor(100000), ratio: 0,
    targetRatio: null, deviation: null, rebalanceAmount: null,
    periodInvested: minor(0), periodWithdrawn: minor(0), periodReturn: null,
    returnRate: null, sort: 999,
  },
]

test('分类持仓合并迁移基线：加权目标比例、未分类不进分母', () => {
  assert.deepEqual(mergeCategoryItems(categoryItems), [
    {
      assetClassId: 'c1', name: '股票', marketValue: 1100000,
      ratio: 73.33333333333333, targetRatio: 59.09090909090909,
      deviation: 14.242424242424235, rebalanceAmount: -10000,
      periodInvested: 100000, periodWithdrawn: 5000, periodReturn: 62000,
      returnRate: 5.181818181818182, sort: 1,
    },
    {
      assetClassId: 'c2', name: '债券', marketValue: 400000,
      ratio: 26.666666666666668, targetRatio: 40,
      deviation: -13.333333333333332, rebalanceAmount: 200000,
      periodInvested: 0, periodWithdrawn: 0, periodReturn: null,
      returnRate: null, sort: 2,
    },
    {
      assetClassId: '__unclassified__', name: '未分类', marketValue: 100000,
      ratio: 0, targetRatio: null, deviation: null, rebalanceAmount: null,
      periodInvested: 0, periodWithdrawn: 0, periodReturn: null,
      returnRate: null, sort: 999,
    },
  ])
  assert.deepEqual(mergeCategoryItems([]), [])
})

const latestItems: AllocationSnapshotItem[] = [
  {
    assetClassId: 'c1', name: '股票', marketValue: minor(900000), periodNetFlow: minor(200000),
    targetRatio: 60, sort: 1, previousMarketValue: minor(600000),
  },
  {
    assetClassId: 'c2', name: '债券', marketValue: minor(400000), periodNetFlow: minor(-50000),
    targetRatio: 40, sort: 2, previousMarketValue: minor(350000),
  },
]

const snapshots: AllocationSnapshot[] = [
  {
    id: 's1', date: day('2024-06-01'), accountBalance: minor(1000000),
    items: [
      {
        assetClassId: 'c1', name: '股票', marketValue: minor(600000), periodNetFlow: minor(100000),
        targetRatio: 60, sort: 1, previousMarketValue: null,
      },
      {
        assetClassId: 'c2', name: '债券', marketValue: minor(350000), periodNetFlow: minor(0),
        targetRatio: 40, sort: 2, previousMarketValue: null,
      },
    ],
  },
  {
    id: 's2', date: day('2024-12-01'), accountBalance: minor(1600000),
    items: [
      {
        assetClassId: 'c1', name: '股票', marketValue: minor(900000), periodNetFlow: minor(200000),
        targetRatio: 60, sort: 1, previousMarketValue: minor(600000),
      },
      {
        assetClassId: 'c2', name: '债券', marketValue: minor(400000), periodNetFlow: minor(-50000),
        targetRatio: 40, sort: 2, previousMarketValue: minor(350000),
      },
    ],
  },
]

test('最新快照持仓明细迁移基线', () => {
  assert.deepEqual(buildAllocationItems(latestItems, minor(1600000)), [
    {
      assetClassId: 'c1', name: '股票', marketValue: 900000,
      ratio: 69.23076923076923, targetRatio: 60, deviation: 9.230769230769226,
      rebalanceAmount: -120000, periodInvested: 200000, periodWithdrawn: 0,
      periodReturn: 100000, returnRate: 12.5, sort: 1,
    },
    {
      assetClassId: 'c2', name: '债券', marketValue: 400000,
      ratio: 30.76923076923077, targetRatio: 40, deviation: -9.23076923076923,
      rebalanceAmount: 120000, periodInvested: 0, periodWithdrawn: 50000,
      periodReturn: 100000, returnRate: 28.57142857142857, sort: 2,
    },
    {
      assetClassId: '__unclassified__', name: '未分类', marketValue: 300000,
      ratio: 0, targetRatio: null, deviation: null, rebalanceAmount: null,
      periodInvested: 0, periodWithdrawn: 0, periodReturn: null,
      returnRate: null, sort: 999,
    },
  ])
})

test('历史快照迁移基线：占比以账户余额为分母', () => {
  assert.deepEqual(buildSnapshotHistory(snapshots), [
    {
      id: 's1', date: '2024-06-01', accountBalance: 1000000,
      items: [
        { assetClassId: 'c1', name: '股票', marketValue: 600000, ratio: 60 },
        { assetClassId: 'c2', name: '债券', marketValue: 350000, ratio: 35 },
        { assetClassId: '__unclassified__', name: '未分类', marketValue: 50000, ratio: 5 },
      ],
    },
    {
      id: 's2', date: '2024-12-01', accountBalance: 1600000,
      items: [
        { assetClassId: 'c1', name: '股票', marketValue: 900000, ratio: 56.25 },
        { assetClassId: 'c2', name: '债券', marketValue: 400000, ratio: 25 },
        { assetClassId: '__unclassified__', name: '未分类', marketValue: 300000, ratio: 18.75 },
      ],
    },
  ])
})
