import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBalanceSheet,
  minor,
  type BalanceSheetAccountInput,
  type Minor,
} from '../src/index.js'

const m = (value: number): Minor => minor(value)

/** DTO 走 JSON 序列化，`-0` 不可观测；快照统一按序列化后的形态比较。 */
const snap = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const account = (
  input: Partial<BalanceSheetAccountInput> & { id: string; actualBalance: Minor },
): BalanceSheetAccountInput => ({
  id: input.id,
  name: input.name ?? input.id,
  type: input.type ?? 'asset',
  categoryId: input.categoryId ?? 'cat',
  categoryName: input.categoryName ?? '分类',
  categorySort: input.categorySort ?? 0,
  actualBalance: input.actualBalance,
  predictedChange: input.predictedChange ?? m(0),
})

/** 迁移前 `GET /reports/balance-sheet?date=2026-11` 的真实账户与余额（整数分）。 */
const REAL_ACCOUNTS: BalanceSheetAccountInput[] = [
  account({ id: 'a1', name: '微信', categoryId: 'cash', categoryName: '现金', categorySort: 0, actualBalance: m(12962) }),
  account({ id: 'a2', name: '云闪付', categoryId: 'cash', categoryName: '现金', categorySort: 0, actualBalance: m(9071286) }),
  account({ id: 'a3', name: '支付宝', categoryId: 'cash', categoryName: '现金', categorySort: 0, actualBalance: m(1084043) }),
  account({ id: 'a4', name: '现金', categoryId: 'cash', categoryName: '现金', categorySort: 0, actualBalance: m(0) }),
  account({ id: 'a5', name: '公积金', categoryId: 'long', categoryName: '长期资产', categorySort: 1, actualBalance: m(100) }),
  account({ id: 'a6', name: '雪球基金', categoryId: 'invest', categoryName: '投资', categorySort: 2, actualBalance: m(95792566) }),
  account({ id: 'a7', name: '支付宝基金', categoryId: 'invest', categoryName: '投资', categorySort: 2, actualBalance: m(10691609) }),
  account({ id: 'l1', name: '民生银行', type: 'liability', categoryId: 'debt', categoryName: '负债', categorySort: 1, actualBalance: m(-64117) }),
  // 预算预测点位：一笔 10000 分支出，账户余额变化量为 −10000
  account({ id: 'l2', name: '花呗', type: 'liability', categoryId: 'debt', categoryName: '负债', categorySort: 1, actualBalance: m(155715), predictedChange: m(-10000) }),
  account({ id: 'l3', name: '京东白条', type: 'liability', categoryId: 'debt', categoryName: '负债', categorySort: 1, actualBalance: m(1381) }),
  account({ id: 'l4', name: '美团月付', type: 'liability', categoryId: 'debt', categoryName: '负债', categorySort: 1, actualBalance: m(54750) }),
  account({ id: 'l5', name: '1688', type: 'liability', categoryId: 'debt', categoryName: '负债', categorySort: 1, actualBalance: m(0) }),
]

test('资产负债表基线：真实账户的分类树、逐级小计与实际值汇总', () => {
  assert.deepEqual(snap(buildBalanceSheet(REAL_ACCOUNTS)), {
    actual: { assets: 116652566, liabilities: 147729, netWorth: 116504837 },
    assetNodes: [
      {
        id: 'cash', name: '现金', type: 'asset', sort: 0, actual: 10168291, predicted: 0,
        children: [
          { id: 'a1', name: '微信', categoryId: 'cash', type: 'asset', actual: 12962, predicted: 0 },
          { id: 'a2', name: '云闪付', categoryId: 'cash', type: 'asset', actual: 9071286, predicted: 0 },
          { id: 'a3', name: '支付宝', categoryId: 'cash', type: 'asset', actual: 1084043, predicted: 0 },
          { id: 'a4', name: '现金', categoryId: 'cash', type: 'asset', actual: 0, predicted: 0 },
        ],
      },
      {
        id: 'long', name: '长期资产', type: 'asset', sort: 1, actual: 100, predicted: 0,
        children: [
          { id: 'a5', name: '公积金', categoryId: 'long', type: 'asset', actual: 100, predicted: 0 },
        ],
      },
      {
        id: 'invest', name: '投资', type: 'asset', sort: 2, actual: 106484175, predicted: 0,
        children: [
          { id: 'a6', name: '雪球基金', categoryId: 'invest', type: 'asset', actual: 95792566, predicted: 0 },
          { id: 'a7', name: '支付宝基金', categoryId: 'invest', type: 'asset', actual: 10691609, predicted: 0 },
        ],
      },
    ],
    liabilityNodes: [
      {
        id: 'debt', name: '负债', type: 'liability', sort: 1, actual: 275963, predicted: 10000,
        children: [
          { id: 'l1', name: '民生银行', categoryId: 'debt', type: 'liability', actual: 64117, predicted: 0 },
          { id: 'l2', name: '花呗', categoryId: 'debt', type: 'liability', actual: 155715, predicted: 10000 },
          { id: 'l3', name: '京东白条', categoryId: 'debt', type: 'liability', actual: 1381, predicted: 0 },
          { id: 'l4', name: '美团月付', categoryId: 'debt', type: 'liability', actual: 54750, predicted: 0 },
          { id: 'l5', name: '1688', categoryId: 'debt', type: 'liability', actual: 0, predicted: 0 },
        ],
      },
    ],
  })
})

test('负债符号口径：顶层先求和再 abs，分类节点逐个 abs 后累加，正负混合时两者不相等', () => {
  const result = buildBalanceSheet([
    account({ id: 'l1', type: 'liability', actualBalance: m(-10000) }),
    account({ id: 'l2', type: 'liability', actualBalance: m(4000) }),
    account({ id: 'a1', type: 'asset', categoryId: 'asset-cat', actualBalance: m(50000) }),
  ])
  assert.equal(result.actual.liabilities, 6000)
  assert.equal(result.actual.netWorth, 44000)
  assert.equal(result.liabilityNodes[0]!.actual, 14000)
  assert.equal(result.liabilityNodes[0]!.children[0]!.actual, 10000)
  assert.equal(result.liabilityNodes[0]!.children[1]!.actual, 4000)
})

test('预测口径：负债变化量取负、资产变化量原值，逐级累加到分类节点', () => {
  const result = buildBalanceSheet([
    account({ id: 'a1', categoryId: 'c1', actualBalance: m(1000), predictedChange: m(500) }),
    account({ id: 'a2', categoryId: 'c1', actualBalance: m(2000), predictedChange: m(-200) }),
    account({ id: 'l1', type: 'liability', categoryId: 'c2', actualBalance: m(-300), predictedChange: m(-700) }),
    account({ id: 'l2', type: 'liability', categoryId: 'c2', actualBalance: m(-400), predictedChange: m(50) }),
  ])
  assert.equal(result.assetNodes[0]!.children[0]!.predicted, 500)
  assert.equal(result.assetNodes[0]!.children[1]!.predicted, -200)
  assert.equal(result.assetNodes[0]!.predicted, 300)
  assert.equal(result.liabilityNodes[0]!.children[0]!.predicted, 700)
  assert.equal(result.liabilityNodes[0]!.children[1]!.predicted, -50)
  assert.equal(result.liabilityNodes[0]!.predicted, 650)
  // 顶层 actual 是时点余额，与 predicted 变化量是两套语义，不互相推导
  assert.equal(result.actual.assets, 3000)
  assert.equal(result.actual.liabilities, 700)
})

test('排序与兜底：按分类 sort 升序，同 sort 保留账户查询顺序；未分类文案由 API 传入不改写', () => {
  const result = buildBalanceSheet([
    account({ id: 'b1', categoryId: 'b', categoryName: 'B', categorySort: 2, actualBalance: m(1) }),
    account({ id: 'u1', categoryId: 'uncategorized', categoryName: '未分类', categorySort: 0, actualBalance: m(2) }),
    account({ id: 'a1', categoryId: 'a', categoryName: 'A', categorySort: 0, actualBalance: m(3) }),
    account({ id: 'a2', categoryId: 'a', categoryName: 'A', categorySort: 0, actualBalance: m(4) }),
  ])
  assert.deepEqual(result.assetNodes.map((node) => node.id), ['uncategorized', 'a', 'b'])
  assert.equal(result.assetNodes[0]!.name, '未分类')
  assert.deepEqual(result.assetNodes[1]!.children.map((child) => child.id), ['a1', 'a2'])
  assert.deepEqual(result.assetNodes[2]!.children.map((child) => child.id), ['b1'])
  assert.deepEqual(result.liabilityNodes, [])
})

test('分类首次出现时以第一个账户的 type / name / sort 为准', () => {
  const result = buildBalanceSheet([
    account({ id: 'x1', type: 'asset', categoryId: 'mixed', categoryName: '先到', categorySort: 7, actualBalance: m(100) }),
    account({ id: 'x2', type: 'liability', categoryId: 'mixed', categoryName: '后到', categorySort: 9, actualBalance: m(-100) }),
  ])
  assert.equal(result.assetNodes.length, 1)
  assert.equal(result.liabilityNodes.length, 0)
  const node = result.assetNodes[0]!
  assert.equal(node.name, '先到')
  assert.equal(node.sort, 7)
  assert.equal(node.actual, 200)
})

test('空账户：汇总全为 0，两张节点表为空', () => {
  assert.deepEqual(snap(buildBalanceSheet([])), {
    actual: { assets: 0, liabilities: 0, netWorth: 0 },
    assetNodes: [],
    liabilityNodes: [],
  })
})
