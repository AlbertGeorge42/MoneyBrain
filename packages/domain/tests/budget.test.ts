import assert from 'node:assert/strict'
import test from 'node:test'
import {
  add,
  budgetContributionSign,
  budgetKindOf,
  computeBudgetStatus,
  generateBudgetOccurrences,
  minor,
  summarizeBudgetUsage,
  type BudgetScope,
  type BudgetUsageRow,
} from '../src/index.js'

// 预算领域算法的迁移基线：固定输入 + 迁移前 API 实现的输出快照。
// 数值来自 apps/api/tests/unit/budget.service.test.ts 与迁移前
// generateBudgetOccurrences 的实跑输出；这里只调用 Domain，不做双实现对照。

const expenseScope: BudgetScope = {
  kind: 'expense',
  accountId: 'A',
  toAccountId: null,
  categoryIds: new Set(['food']),
}

const row = (overrides: Partial<BudgetUsageRow> = {}): BudgetUsageRow => ({
  type: 'expense',
  accountId: 'A',
  toAccountId: null,
  categoryId: 'food',
  excludeFromIncomeExpense: false,
  relatedType: null,
  amount: minor(50),
  ...overrides,
})

test('计入口径基线：主类型 +1、原类型退款 −1、其余 0', () => {
  assert.equal(budgetContributionSign(row(), expenseScope), 1)
  assert.equal(budgetContributionSign(row({ type: 'refund', relatedType: 'expense' }), expenseScope), -1)
  assert.equal(budgetContributionSign(row({ type: 'refund', relatedType: 'income' }), expenseScope), 0)
  assert.equal(budgetContributionSign(row({ type: 'income' }), expenseScope), 0)
  assert.equal(budgetContributionSign(row({ accountId: 'B' }), expenseScope), 0)
  assert.equal(budgetContributionSign(row({ excludeFromIncomeExpense: true }), expenseScope), 0)
  assert.equal(budgetContributionSign(row({ categoryId: null }), expenseScope), 0)
})

test('计入口径基线：转账预算只认绑定的账户对', () => {
  const scope: BudgetScope = {
    kind: 'transfer',
    accountId: 'A',
    toAccountId: 'B',
    categoryIds: new Set(['move']),
  }
  const transfer = (accountId: string, toAccountId: string) =>
    row({ type: 'transfer', categoryId: 'move', accountId, toAccountId })
  assert.equal(budgetContributionSign(transfer('A', 'B'), scope), 1)
  assert.equal(budgetContributionSign(transfer('C', 'B'), scope), 0)
  assert.equal(budgetContributionSign(transfer('A', 'D'), scope), 0)
  assert.equal(budgetContributionSign(row({ type: 'refund', relatedType: 'transfer' }), scope), 0)
})

test('预算状态基线：支出减退款算出已用 30 / 使用率 30 / 剩余 70', () => {
  const result = computeBudgetStatus({ amount: minor(100), scope: expenseScope }, [
    row({ amount: minor(50) }),
    row({ type: 'refund', relatedType: 'expense', amount: minor(20) }),
  ])
  assert.deepEqual(result, {
    used: 30,
    remaining: 70,
    percentage: 30,
    isOverBudget: false,
  })
})

test('预算状态基线：跨期退款让已用夹到 0，剩余不得超过额度', () => {
  const result = computeBudgetStatus({ amount: minor(100), scope: expenseScope }, [
    row({ type: 'refund', relatedType: 'expense', amount: minor(80) }),
  ])
  assert.deepEqual(result, {
    used: 0,
    remaining: 100,
    percentage: 0,
    isOverBudget: false,
  })
})

test('预算状态基线：超支 180% 返回真实百分比，不截断', () => {
  const result = computeBudgetStatus({ amount: minor(100), scope: expenseScope }, [
    row({ amount: minor(180) }),
  ])
  assert.deepEqual(result, {
    used: 180,
    remaining: 0,
    percentage: 180,
    isOverBudget: true,
  })
})

test('预算状态基线：转账预算只累计绑定账户对', () => {
  const scope: BudgetScope = {
    kind: 'transfer',
    accountId: 'A',
    toAccountId: 'B',
    categoryIds: new Set(['move']),
  }
  const transfer = (accountId: string, toAccountId: string, amount: number) =>
    row({ type: 'transfer', categoryId: 'move', accountId, toAccountId, amount: minor(amount) })
  const result = computeBudgetStatus({ amount: minor(200), scope }, [
    transfer('A', 'B', 100),
    transfer('C', 'B', 30),
    transfer('A', 'D', 20),
  ])
  assert.equal(result.used, 100)
  assert.equal(result.remaining, 100)
})

test('预算状态基线：未分类交易不计入；额度为 0 时使用率为 0', () => {
  const excluded = computeBudgetStatus({ amount: minor(100), scope: expenseScope }, [
    row({ categoryId: null, amount: minor(50) }),
  ])
  assert.equal(excluded.used, 0)

  const zeroAmount = computeBudgetStatus({ amount: minor(0), scope: expenseScope }, [
    row({ amount: minor(50) }),
  ])
  assert.equal(zeroAmount.percentage, 0)
  assert.equal(zeroAmount.isOverBudget, true)
})

test('预算状态基线：使用率按 Math.round 舍入（33.5% → 34）', () => {
  const result = computeBudgetStatus({ amount: minor(1000), scope: expenseScope }, [
    row({ amount: minor(335) }),
  ])
  assert.equal(result.percentage, 34)
})

test('下钻基线：条数与合计 == 预算用量，符号金额随原类型退款为负', () => {
  const rows = [
    row({ amount: minor(5000) }),
    row({ type: 'refund', relatedType: 'expense', amount: minor(2000) }),
    row({ accountId: 'B', amount: minor(3000) }),
    row({ excludeFromIncomeExpense: true, amount: minor(4000) }),
    row({ type: 'income', amount: minor(6000) }),
  ]
  const summary = summarizeBudgetUsage(rows, expenseScope)
  assert.deepEqual(summary.contributions, [
    { index: 0, signedAmount: 5000 },
    { index: 1, signedAmount: -2000 },
  ])
  assert.equal(summary.count, 2)
  assert.equal(summary.total, 3000)
  assert.equal(summary.used, 3000)
  assert.equal(
    summary.used,
    computeBudgetStatus({ amount: minor(10000), scope: expenseScope }, rows).used,
  )
})

test('SQL 预聚合一致性：按 groupBy 键折叠明细后，聚合行与逐笔算出同一已用', () => {
  const details: BudgetUsageRow[] = [
    row({ amount: minor(5000) }),
    row({ amount: minor(1500) }),
    row({ type: 'refund', relatedType: 'expense', amount: minor(2000) }),
    row({ accountId: 'B', amount: minor(3000) }),
    row({ excludeFromIncomeExpense: true, amount: minor(4000) }),
    row({ type: 'income', amount: minor(6000) }),
    row({ categoryId: null, amount: minor(7000) }),
    row({ type: 'refund', relatedType: 'income', amount: minor(8000) }),
  ]

  // 与 transactionRepo.sumActiveAmountByBudgetScope 相同的 7 个 groupBy 键；
  // 逐笔口径判定只用这些字段，因此同一桶内的符号必然一致。
  const buckets = new Map<string, BudgetUsageRow>()
  for (const item of details) {
    const key = [
      item.accountId,
      item.toAccountId ?? '',
      item.categoryId ?? '',
      item.type,
      item.relatedType ?? '',
      String(item.excludeFromIncomeExpense),
    ].join('|')
    const existing = buckets.get(key)
    if (existing) {
      existing.amount = add(existing.amount, item.amount)
    } else {
      buckets.set(key, { ...item })
    }
  }

  const aggregated = [...buckets.values()]
  const status = computeBudgetStatus({ amount: minor(100000), scope: expenseScope }, aggregated)
  const summary = summarizeBudgetUsage(details, expenseScope)

  assert.equal(summary.used, 4500)
  assert.equal(status.used, summary.used)
  assert.equal(status.remaining, 95500)
})

test('下钻基线：跨期退款让明细合计为负时，total 保留负数而 used 夹到 0', () => {
  const summary = summarizeBudgetUsage(
    [row({ type: 'refund', relatedType: 'expense', amount: minor(8000) })],
    expenseScope,
  )
  assert.equal(summary.count, 1)
  assert.equal(summary.total, -8000)
  assert.equal(summary.used, 0)
})

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const snapshot = (points: { date: Date; periodStart: Date; periodEnd: Date }[]) =>
  points.map((p) => [fmt(p.date), fmt(p.periodStart), fmt(p.periodEnd)])

test('周期展开基线：daily 每天一个点位', () => {
  assert.deepEqual(
    snapshot(generateBudgetOccurrences(new Date(2026, 0, 1), new Date(2026, 0, 3), 'daily', null)),
    [
      ['2026-01-01', '2026-01-01', '2026-01-01'],
      ['2026-01-02', '2026-01-02', '2026-01-02'],
      ['2026-01-03', '2026-01-03', '2026-01-03'],
    ],
  )
})

test('周期展开基线：weekly 指定周一，点位与周期范围对齐', () => {
  assert.deepEqual(
    snapshot(generateBudgetOccurrences(new Date(2026, 0, 1), new Date(2026, 0, 20), 'weekly', 0)),
    [
      ['2026-01-05', '2026-01-05', '2026-01-11'],
      ['2026-01-12', '2026-01-12', '2026-01-18'],
      ['2026-01-19', '2026-01-19', '2026-01-25'],
    ],
  )
})

test('周期展开基线：weekly 缺省从窗口首日算起，周期仍按 ISO 周', () => {
  assert.deepEqual(
    snapshot(generateBudgetOccurrences(new Date(2026, 0, 1), new Date(2026, 0, 20), 'weekly', null)),
    [
      ['2026-01-01', '2025-12-29', '2026-01-04'],
      ['2026-01-08', '2026-01-05', '2026-01-11'],
      ['2026-01-15', '2026-01-12', '2026-01-18'],
    ],
  )
})

test('周期展开基线：monthly 缺省月末，窗口末日之前的点位才纳入', () => {
  assert.deepEqual(
    snapshot(generateBudgetOccurrences(new Date(2026, 0, 15), new Date(2026, 2, 10), 'monthly', null)),
    [
      ['2026-01-31', '2026-01-01', '2026-01-31'],
      ['2026-02-28', '2026-02-01', '2026-02-28'],
    ],
  )
})

test('周期展开基线：monthly 指定 15 号，短月无 31 号时跳过该月', () => {
  assert.deepEqual(
    snapshot(generateBudgetOccurrences(new Date(2026, 0, 1), new Date(2026, 2, 31), 'monthly', 15)),
    [
      ['2026-01-15', '2026-01-01', '2026-01-31'],
      ['2026-02-15', '2026-02-01', '2026-02-28'],
      ['2026-03-15', '2026-03-01', '2026-03-31'],
    ],
  )
  assert.deepEqual(
    snapshot(generateBudgetOccurrences(new Date(2026, 1, 1), new Date(2026, 1, 28), 'monthly', 31)),
    [],
  )
})

test('周期展开基线：quarterly 缺省季末，天偏移从季度起点算起', () => {
  assert.deepEqual(
    snapshot(generateBudgetOccurrences(new Date(2026, 1, 1), new Date(2026, 5, 30), 'quarterly', null)),
    [
      ['2026-03-31', '2026-01-01', '2026-03-31'],
      ['2026-06-30', '2026-04-01', '2026-06-30'],
    ],
  )
  assert.deepEqual(
    snapshot(generateBudgetOccurrences(new Date(2026, 0, 1), new Date(2026, 6, 31), 'quarterly', 10)),
    [
      ['2026-01-11', '2026-01-01', '2026-03-31'],
      ['2026-04-11', '2026-04-01', '2026-06-30'],
      ['2026-07-11', '2026-07-01', '2026-09-30'],
    ],
  )
})

test('周期展开基线：yearly 缺省 12 月 31 日', () => {
  assert.deepEqual(
    snapshot(generateBudgetOccurrences(new Date(2026, 0, 1), new Date(2027, 11, 31), 'yearly', null)),
    [
      ['2026-12-31', '2026-01-01', '2026-12-31'],
      ['2027-12-31', '2027-01-01', '2027-12-31'],
    ],
  )
})

test('预算类型收窄基线：三种合法值原样返回，未知值直接失败', () => {
  assert.equal(budgetKindOf('income'), 'income')
  assert.equal(budgetKindOf('expense'), 'expense')
  assert.equal(budgetKindOf('transfer'), 'transfer')
  assert.throws(() => budgetKindOf('saving'), /未知预算类型/)
})
