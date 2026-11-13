import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ZERO_MINOR,
  buildAssetProjection,
  buildCashFlowProjection,
  buildPeriodPlanPoints,
  buildProjectionBuckets,
  bucketStartOf,
  cashFlowOf,
  coveredInRange,
  excludeCovered,
  futureLimitOf,
  matchOccurrences,
  minor,
  projectionFlowValue,
  projectionSourceValue,
  type CommittedEvent,
  type LedgerTransaction,
  type LocalDate,
  type PlannedEvent,
  type ProjectionAccountRef,
} from '../src/index.js'

// 投影领域算法的迁移基线：固定输入 + 迁移前实现的输出快照。
// 分桶 / 未来上限 / 三来源数值取自迁移前 apps/api 的实跑输出；
// 推演链的等价性另由迁移前后端点 DTO 逐字段对照验证。
// 这里只调 Domain，不做新旧双实现对照。

const D = (s: string) => s as LocalDate
const m = (n: number) => minor(n)

type LedgerSpec = Partial<LedgerTransaction> & {
  id: string
  kind: LedgerTransaction['kind']
  date: LocalDate
  amount: number
}

const ledger = (o: LedgerSpec): LedgerTransaction => ({
  id: o.id,
  kind: o.kind,
  date: o.date,
  amount: m(o.amount),
  fee: o.fee ?? ZERO_MINOR,
  coupon: o.coupon ?? ZERO_MINOR,
  accountId: o.accountId ?? 'A',
  toAccountId: o.toAccountId ?? null,
  categoryId: o.categoryId ?? 'cat1',
  relatedType: o.relatedType ?? null,
  excludeFromIncomeExpense: false,
})

const accounts: ProjectionAccountRef[] = [
  { id: 'A', name: '现金', type: 'asset', categoryId: 'cash', categoryName: '现金', isInvestment: false, sort: 1 },
  { id: 'B', name: '银行卡', type: 'asset', categoryId: 'cash', categoryName: '现金', isInvestment: false, sort: 1 },
  { id: 'L', name: '信用卡', type: 'liability', categoryId: 'credit', categoryName: '信用', isInvestment: false, sort: 2 },
]

const plannedIncome: PlannedEvent = {
  source: 'planned',
  date: D('2026-11-20'),
  ledger: ledger({ id: 'p1', kind: 'income', date: D('2026-11-20'), amount: 20000 }),
  occurrence: {
    budgetId: 'b1', budgetName: '工资', type: 'income', amount: m(20000),
    accountId: 'A', toAccountId: null,
    periodStart: D('2026-11-01'), periodEnd: D('2026-11-30'),
  },
}

const committedExpense: CommittedEvent = {
  source: 'committed',
  date: D('2026-12-05'),
  ledger: ledger({ id: 'c1', kind: 'expense', date: D('2026-12-05'), amount: 3000 }),
  transactionId: 't1',
}

// ===== 分桶与未来上限（迁移前 report/bucket.ts 实跑基线） =====

const bucketSnapshot = (granularity: 'day' | 'week' | 'month' | 'year', from: string, to: string) =>
  buildProjectionBuckets(granularity, D(from), D(to))
    .slice(0, 4)
    .map((b) => [b.label, b.start, b.end, b.endExclusive])

test('分桶基线：day 每天一个桶，endExclusive 为次日', () => {
  const bs = buildProjectionBuckets('day', D('2026-11-06'), D('2026-11-09'))
  assert.equal(bs.length, 4)
  assert.deepEqual(bs.map((b) => [b.label, b.start, b.end, b.endExclusive]), [
    ['2026-11-06', '2026-11-06', '2026-11-06', '2026-11-07'],
    ['2026-11-07', '2026-11-07', '2026-11-07', '2026-11-08'],
    ['2026-11-08', '2026-11-08', '2026-11-08', '2026-11-09'],
    ['2026-11-09', '2026-11-09', '2026-11-09', '2026-11-10'],
  ])
})

test('分桶基线：week ISO 周一起，首尾桶向外对齐', () => {
  assert.deepEqual(bucketSnapshot('week', '2026-10-28', '2026-11-20'), [
    ['2026-W44', '2026-10-26', '2026-11-01', '2026-11-02'],
    ['2026-W45', '2026-11-02', '2026-11-08', '2026-11-09'],
    ['2026-W46', '2026-11-09', '2026-11-15', '2026-11-16'],
    ['2026-W47', '2026-11-16', '2026-11-22', '2026-11-23'],
  ])
})

test('分桶基线：month 自然月，末桶 end 可溢出 to', () => {
  assert.deepEqual(bucketSnapshot('month', '2026-11-06', '2027-01-15'), [
    ['2026-11', '2026-11-01', '2026-11-30', '2026-12-01'],
    ['2026-12', '2026-12-01', '2026-12-31', '2027-01-01'],
    ['2027-01', '2027-01-01', '2027-01-31', '2027-02-01'],
  ])
  assert.equal(buildProjectionBuckets('month', D('2026-11-06'), D('2027-01-15')).length, 3)
})

test('分桶基线：year 自然年，跨年周 2026-W53 单桶', () => {
  assert.deepEqual(bucketSnapshot('year', '2026-11-06', '2028-06-30'), [
    ['2026', '2026-01-01', '2026-12-31', '2027-01-01'],
    ['2027', '2027-01-01', '2027-12-31', '2028-01-01'],
    ['2028', '2028-01-01', '2028-12-31', '2029-01-01'],
  ])
  assert.deepEqual(bucketSnapshot('week', '2026-12-28', '2027-01-03'), [
    ['2026-W53', '2026-12-28', '2027-01-03', '2027-01-04'],
  ])
})

test('分桶基线：过去区间不设限，from 向外对齐到桶起点', () => {
  assert.deepEqual(bucketSnapshot('day', '2025-01-01', '2025-01-03'), [
    ['2025-01-01', '2025-01-01', '2025-01-01', '2025-01-02'],
    ['2025-01-02', '2025-01-02', '2025-01-02', '2025-01-03'],
    ['2025-01-03', '2025-01-03', '2025-01-03', '2025-01-04'],
  ])
  assert.deepEqual(bucketSnapshot('month', '2026-11-20', '2026-12-05'), [
    ['2026-11', '2026-11-01', '2026-11-30', '2026-12-01'],
    ['2026-12', '2026-12-01', '2026-12-31', '2027-01-01'],
  ])
})

test('未来上限基线：日 3 个月 / 周 6 个月 / 月 12 个月末 / 年 3 年', () => {
  assert.equal(futureLimitOf('day', D('2026-11-06')), '2027-02-06')
  assert.equal(futureLimitOf('week', D('2026-11-06')), '2027-05-06')
  assert.equal(futureLimitOf('month', D('2026-11-06')), '2027-11-30')
  assert.equal(futureLimitOf('year', D('2026-11-06')), '2029-12-31')
})

test('bucketStartOf 基线：四粒度归到所在桶起点', () => {
  assert.deepEqual({
    day: bucketStartOf('day', D('2026-11-06')),
    week: bucketStartOf('week', D('2026-11-06')),
    month: bucketStartOf('month', D('2026-11-06')),
    year: bucketStartOf('year', D('2026-11-06')),
  }, { day: '2026-11-06', week: '2026-11-02', month: '2026-11-01', year: '2026-01-01' })
})

// ===== 三来源合成 =====

test('三来源基线：flowValue total = actual + planned + committed', () => {
  assert.deepEqual(projectionFlowValue(m(20000), m(50000), m(3000)), {
    actual: 20000, planned: 50000, committed: 3000, total: 73000,
  })
  assert.deepEqual(projectionFlowValue(m(0), m(0), m(0)), {
    actual: 0, planned: 0, committed: 0, total: 0,
  })
})

test('三来源基线：sourceValue 空 Map 得 planned=null（无预算不等于 0）', () => {
  assert.deepEqual(projectionSourceValue(m(100), m(50), new Map([['c', m(20)]])), {
    actual: 100, committed: 50, planned: 20, total: 170,
  })
  assert.deepEqual(projectionSourceValue(m(100), m(50), new Map()), {
    actual: 100, committed: 50, planned: null, total: 150,
  })
})

// ===== occurrence 互斥匹配 =====

const plannedExpense = (id: string, date: string, amount: number): PlannedEvent => ({
  source: 'planned', date: D(date),
  ledger: ledger({ id, kind: 'expense', date: D(date), amount }),
  occurrence: {
    budgetId: `b-${id}`, budgetName: '房租', type: 'expense', amount: m(amount),
    accountId: 'A', toAccountId: null,
    periodStart: D('2026-11-01'), periodEnd: D('2026-11-30'),
  },
})

const committedAt = (id: string, date: string, amount: number, kind: LedgerTransaction['kind'] = 'expense'): CommittedEvent => ({
  source: 'committed', date: D(date),
  ledger: ledger({ id, kind, date: D(date), amount }),
  transactionId: id,
})

test('occurrence 基线：金额不参与匹配，同类型同账户同分类即视为已兑现', () => {
  const covered = matchOccurrences(
    [plannedExpense('p1', '2026-11-20', 2000)],
    [committedAt('t1', '2026-11-20', 800)],
  )
  assert.equal(covered.length, 1)
  assert.equal(covered[0]!.event.occurrence.amount, 2000)
  assert.equal(covered[0]!.transactionId, 't1')
  assert.equal(covered[0]!.transactionDate, '2026-11-20')
})

test('occurrence 基线：同日优先于周期内先到先得', () => {
  const covered = matchOccurrences(
    [plannedExpense('p-early', '2026-11-05', 100), plannedExpense('p-same', '2026-11-20', 200)],
    [committedAt('t-same', '2026-11-20', 50)],
  )
  assert.equal(covered.length, 1)
  assert.equal(covered[0]!.event.occurrence.budgetId, 'b-p-same')
})

test('occurrence 基线：类型不同 / 账户不同 / 周期外不覆盖', () => {
  // planned 是 income 点位，真实交易是 expense：类型不符，不覆盖
  assert.equal(matchOccurrences([plannedIncome], [committedAt('t1', '2026-11-20', 800, 'expense')]).length, 0)
  // 同类型同分类同日期才覆盖（作为对照）
  assert.equal(matchOccurrences([plannedIncome], [committedAt('t1', '2026-11-20', 800, 'income')]).length, 1)
  assert.equal(matchOccurrences(
    [plannedExpense('p1', '2026-11-20', 100)],
    [{ ...committedAt('t1', '2026-11-20', 100), ledger: { ...ledger({ id: 't1', kind: 'expense', date: D('2026-11-20'), amount: 100 }), accountId: 'B' } }],
  ).length, 0)
  assert.equal(matchOccurrences(
    [plannedExpense('p1', '2026-11-20', 100)],
    [committedAt('t1', '2026-12-20', 100)],
  ).length, 0)
})

test('occurrence 基线：一笔交易最多覆盖一个点位，剔除与区间过滤', () => {
  const planned = [plannedExpense('p1', '2026-11-05', 100), plannedExpense('p2', '2026-11-20', 200)]
  const covered = matchOccurrences(planned, [
    committedAt('t1', '2026-11-08', 100), committedAt('t2', '2026-11-22', 200),
  ])
  assert.equal(covered.length, 2)
  assert.deepEqual(excludeCovered(planned, covered), [])
  assert.deepEqual(coveredInRange(covered, D('2026-11-01'), D('2026-11-10')).map((c) => c.budgetId), ['b-p1'])
  assert.equal(coveredInRange(covered, D('2026-11-01'), D('2026-11-10'))[0]!.amount, 100)
})

// ===== 分录 → 现金流 =====

test('cashFlowOf 基线：收入计流入；现金互转本金不计，只计手续费', () => {
  // 迁移前 outflow = neg(sum(空))，即 -0；逐行搬迁保留该符号，不做「顺手修」。
  // -0 === 0 且 JSON 序列化输出 0，因此用 === 断言数值（strictEqual 会区分 -0）。
  const income = cashFlowOf(ledger({ id: 'x1', kind: 'income', date: D('2026-11-01'), amount: 1000 }), new Set(['A']))
  assert.ok(income.inflow === 1000)
  assert.ok(income.outflow === 0)

  const freeTransfer = cashFlowOf(ledger({ id: 'x2', kind: 'transfer', date: D('2026-11-01'), amount: 1000, toAccountId: 'B' }), new Set(['A', 'B']))
  assert.ok(freeTransfer.inflow === 0)
  assert.ok(freeTransfer.outflow === 0)

  const feeTransfer = cashFlowOf(ledger({ id: 'x3', kind: 'transfer', date: D('2026-11-01'), amount: 1000, toAccountId: 'B', fee: m(10) }), new Set(['A', 'B']))
  assert.ok(feeTransfer.inflow === 0)
  assert.ok(feeTransfer.outflow === 10)
})

// ===== 资产推演完整链 =====

const buckets = buildProjectionBuckets('month', D('2026-10-01'), D('2026-12-31'))
const baseBalances = new Map([['A', m(50000)], ['B', m(10000)], ['L', m(-10000)]])
const historicalBalances = new Map([
  [D('2026-11-01'), new Map([['A', m(40000)], ['B', m(5000)], ['L', m(-8000)]])],
])
const events = { planned: [plannedIncome], committed: [committedExpense], covered: [] }

test('资产推演基线：历史桶真实余额、未来桶累计增量、total = actual + planned + committed', () => {
  const out = buildAssetProjection({
    asOf: D('2026-11-06'), buckets, accounts, baseBalances, historicalBalances, events,
  })
  assert.deepEqual(out.base, { assets: 60000, liabilities: 10000, netWorth: 50000 })
  assert.deepEqual(out.points.map((p) => [p.label, p.actual, p.planned, p.committed, p.total]), [
    ['2026-10', { assets: 45000, liabilities: 8000, netWorth: 37000 }, { assets: 0, liabilities: 0, netWorth: 0 }, { assets: 0, liabilities: 0, netWorth: 0 }, { assets: 45000, liabilities: 8000, netWorth: 37000 }],
    ['2026-11', { assets: 60000, liabilities: 10000, netWorth: 50000 }, { assets: 20000, liabilities: 0, netWorth: 20000 }, { assets: 0, liabilities: 0, netWorth: 0 }, { assets: 80000, liabilities: 10000, netWorth: 70000 }],
    ['2026-12', { assets: 60000, liabilities: 10000, netWorth: 50000 }, { assets: 20000, liabilities: 0, netWorth: 20000 }, { assets: -3000, liabilities: 0, netWorth: -3000 }, { assets: 77000, liabilities: 10000, netWorth: 67000 }],
  ])
  // 历史桶 covered 空、明细无未来标记；混合桶账户 A 有未来事件
  assert.deepEqual(out.points[0]!.covered, [])
  assert.equal(out.points[0]!.accounts[0]!.hasFutureEvents, false)
  assert.equal(out.points[1]!.accounts[0]!.hasFutureEvents, true)
  assert.equal(out.points[1]!.accounts[0]!.planned, 20000)
  assert.equal(out.points[0]!.accounts[2]!.actual, 8000) // 负债取正数欠款
  assert.deepEqual(out.points[1]!.categories.map((c) => [c.categoryId, c.total]), [['cash', 80000], ['credit', 10000]])
})

test('资产推演基线：被覆盖点位从 planned 剔除并输出 covered', () => {
  const covered = matchOccurrences(
    [plannedIncome],
    [committedAt('t0', '2026-11-20', 800, 'income')],
  )
  const out = buildAssetProjection({
    asOf: D('2026-11-06'), buckets, accounts, baseBalances, historicalBalances,
    events: { planned: excludeCovered([plannedIncome], covered), committed: [committedExpense], covered },
  })
  assert.equal(out.points[1]!.planned.assets, 0)
  assert.equal(out.points[1]!.covered.length, 1)
  assert.equal(out.points[1]!.covered[0]!.budgetId, 'b1')
  assert.equal(out.points[1]!.covered[0]!.transactionId, 't0')
})

// ===== 现金流推演完整链 =====

const actualTransactions = [
  { date: D('2026-10-10'), ledger: ledger({ id: 'a1', kind: 'income', date: D('2026-10-10'), amount: 10000 }) },
  { date: D('2026-10-20'), ledger: ledger({ id: 'a2', kind: 'expense', date: D('2026-10-20'), amount: 4000 }) },
]

test('现金流推演基线：期初 + 逐桶净额 = 期末，三来源窗口归约', () => {
  const out = buildCashFlowProjection({
    asOf: D('2026-11-06'), buckets, cashAccountIds: new Set(['A', 'B']),
    actualTransactions, openingBalances: new Map([['A', m(20000)], ['B', m(5000)]]), events,
  })
  assert.equal(out.startCash, 25000)
  assert.equal(out.endCash, 48000)
  assert.deepEqual(out.cashInflow, { actual: 10000, planned: 20000, committed: 0, total: 30000 })
  assert.deepEqual(out.cashOutflow, { actual: 4000, planned: 0, committed: 3000, total: 7000 })
  assert.deepEqual(out.netCashFlow, { actual: 6000, planned: 20000, committed: -3000, total: 23000 })
  assert.deepEqual(out.points.map((p) => [p.label, p.inflow.total, p.outflow.total, p.net.total, p.startCash, p.endCash]), [
    ['2026-10', 10000, 4000, 6000, 25000, 31000],
    ['2026-11', 20000, 0, 20000, 31000, 51000],
    ['2026-12', 0, 3000, -3000, 51000, 48000],
  ])
})

test('现金流推演基线：首桶在 asOf 之后时，桶起点前的 planned 净额滚入期初', () => {
  const futureBuckets = buildProjectionBuckets('month', D('2026-12-01'), D('2026-12-31'))
  const out = buildCashFlowProjection({
    asOf: D('2026-11-06'), buckets: futureBuckets, cashAccountIds: new Set(['A', 'B']),
    actualTransactions: [], openingBalances: new Map([['A', m(20000)], ['B', m(5000)]]), events,
  })
  // 期初 25000 + 11-20 的 planned 20000 = 45000；12 月只剩 committed -3000
  assert.equal(out.startCash, 45000)
  assert.equal(out.endCash, 42000)
  assert.deepEqual(out.cashInflow, { actual: 0, planned: 0, committed: 0, total: 0 })
  assert.deepEqual(out.netCashFlow, { actual: 0, planned: 0, committed: -3000, total: -3000 })
})

// ===== 预算期间计划 =====

test('期间计划基线：无预算桶 totals=null，有预算桶三类累加并排序', () => {
  const points = buildPeriodPlanPoints({
    granularity: 'month', buckets,
    occurrences: [
      { budgetId: 'b1', budgetName: '工资', type: 'income', date: D('2026-11-20'), amount: m(20000) },
      { budgetId: 'b2', budgetName: '房租', type: 'expense', date: D('2026-11-05'), amount: m(3000) },
      { budgetId: 'b1', budgetName: '工资', type: 'income', date: D('2026-12-20'), amount: m(20000) },
    ],
  })
  assert.equal(points[0]!.hasBudget, false)
  assert.equal(points[0]!.totals, null)
  assert.deepEqual(points[0]!.budgets, [])
  assert.equal(points[1]!.hasBudget, true)
  assert.deepEqual(points[1]!.budgets.map((b) => b.budgetId), ['b2', 'b1'])
  assert.deepEqual(points[1]!.totals, { income: 20000, expense: 3000, transfer: 0 })
  assert.deepEqual(points[2]!.totals, { income: 20000, expense: 0, transfer: 0 })
})
