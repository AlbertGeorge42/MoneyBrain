import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCategoryTree,
  buildIncomeExpenseProjection,
  buildIncomeExpenseStatement,
  minor,
  type CategoryRef,
  type CoveredOccurrence,
  type IncomeExpenseStatementInput,
  type LedgerTransaction,
  type LocalDate,
  type Minor,
  type ProjectionBucket,
} from '../src/index.js'

const m = (value: number): Minor => minor(value)
const D = (value: string): LocalDate => value as LocalDate
const snap = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const tx = (
  input: Partial<LedgerTransaction> & { id: string; kind: LedgerTransaction['kind']; amount: Minor },
): LedgerTransaction => ({
  id: input.id,
  kind: input.kind,
  date: input.date ?? D('2026-01-15'),
  amount: input.amount,
  fee: input.fee ?? m(0),
  coupon: input.coupon ?? m(0),
  accountId: input.accountId ?? 'acc',
  toAccountId: input.toAccountId ?? null,
  categoryId: input.categoryId ?? null,
  relatedType: input.relatedType ?? null,
  excludeFromIncomeExpense: input.excludeFromIncomeExpense ?? false,
})

const cat = (
  id: string,
  name: string,
  type: string,
  sort: number,
  parentId: string | null = null,
): CategoryRef => ({ id, name, type, parentId, sort })

const CATEGORIES: CategoryRef[] = [
  cat('salary', '工资', 'income', 0),
  cat('food', '餐饮', 'expense', 0),
]

const statementInput = (overrides: Partial<IncomeExpenseStatementInput> = {}): IncomeExpenseStatementInput => ({
  ledger: [],
  balanceOnlyLedger: [],
  categories: CATEGORIES,
  categoryNames: new Map(CATEGORIES.map((c) => [c.id, c.name])),
  uncategorizedLabel: '未分类',
  predictions: [],
  rangeStart: new Date(2026, 0, 1).getTime(),
  rangeEndExclusive: new Date(2026, 1, 1).getTime(),
  startNetWorth: m(0),
  endNetWorth: m(0),
  includeExcluded: false,
  ...overrides,
})

const bucket = (label: string, start: string, end: string): ProjectionBucket => ({
  granularity: 'day', label, start: D(start), end: D(end), endExclusive: D(end),
})

const BUCKETS: ProjectionBucket[] = [
  bucket('01', '2026-01-01', '2026-01-01'),
  bucket('02', '2026-01-02', '2026-01-02'),
  bucket('03', '2026-01-03', '2026-01-03'),
]

// ===== 收支表 =====

test('收支表基线：退款冲减、分类净额、结余与对账条差额', () => {
  const report = buildIncomeExpenseStatement(statementInput({
    ledger: [
      tx({ id: 't1', kind: 'income', amount: m(1000), categoryId: 'salary' }),
      tx({ id: 't2', kind: 'expense', amount: m(300), categoryId: 'food' }),
      tx({ id: 't3', kind: 'refund', amount: m(50), categoryId: 'food', relatedType: 'expense' }),
    ],
    endNetWorth: m(750),
  }))
  assert.equal(report.income.actual, 1000)
  assert.equal(report.expense.actual, 250)
  assert.equal(report.balance.actual, 750)
  assert.equal(report.expenseByCategory['餐饮'], 250)
  assert.equal(report.expenseCategoryDetails.find((n) => n.categoryId === 'food')?.actual, 250)
  assert.deepEqual(snap(report.reconciliation), {
    startNetWorth: 0, netIncome: 1000, netExpense: 250, other: 0,
    endNetWorth: 750, difference: 0,
  })
})

test('收支表基线：未分类金额进明细树与按名称汇总，合计与展开项对得上', () => {
  const report = buildIncomeExpenseStatement(statementInput({
    ledger: [tx({ id: 't1', kind: 'expense', amount: m(70), categoryId: null })],
    endNetWorth: m(-70),
  }))
  assert.equal(report.expense.actual, 70)
  assert.equal(report.expenseByCategory['未分类'], 70)
  assert.equal(report.expenseCategoryDetails.find((n) => n.categoryId === 'uncategorized')?.actual, 70)
  assert.equal(report.expenseCategoryDetails.find((n) => n.categoryId === 'uncategorized')?.sort, Number.MAX_SAFE_INTEGER)
})

test('收支表基线：includeExcluded 两态只改「不计收支」是否计入', () => {
  const ledger = [
    tx({ id: 't1', kind: 'expense', amount: m(300), categoryId: 'food' }),
    tx({ id: 't2', kind: 'expense', amount: m(200), categoryId: 'food', excludeFromIncomeExpense: true }),
  ]
  assert.equal(buildIncomeExpenseStatement(statementInput({ ledger })).expense.actual, 300)
  assert.equal(buildIncomeExpenseStatement(statementInput({ ledger, includeExcluded: true })).expense.actual, 500)
})

test('收支表预测：按半开窗口过滤、transfer 不计入、hasPredictions 只要拿到点位就为真', () => {
  const base = statementInput({
    predictions: [
      { date: new Date(2026, 0, 10, 12).getTime(), type: 'income', amount: m(5000), categoryId: 'salary' },
      { date: new Date(2026, 0, 20).getTime(), type: 'expense', amount: m(800), categoryId: 'food' },
      { date: new Date(2026, 0, 21).getTime(), type: 'transfer', amount: m(9999), categoryId: null },
      { date: new Date(2025, 11, 31).getTime(), type: 'income', amount: m(7000), categoryId: 'salary' },
      { date: new Date(2026, 1, 1).getTime(), type: 'expense', amount: m(6000), categoryId: 'food' },
    ],
  })
  const report = buildIncomeExpenseStatement(base)
  assert.equal(report.income.predicted, 5000)
  assert.equal(report.expense.predicted, 800)
  assert.equal(report.balance.predicted, 4200)
  assert.equal(report.hasPredictions, true)
  assert.equal(report.incomeCategoryDetails.find((n) => n.categoryId === 'salary')?.predicted, 5000)
  // 全部点位被窗口过滤掉时仍应挂提示文案（迁移前口径）
  const outside = buildIncomeExpenseStatement({ ...base, rangeStart: new Date(2027, 0, 1).getTime(), rangeEndExclusive: new Date(2027, 1, 1).getTime() })
  assert.equal(outside.income.predicted, 0)
  assert.equal(outside.hasPredictions, true)
})

test('收支表对账条：转账手续费是减项，差额归零；余额对不上时给出差额', () => {
  const balanceOnlyLedger = [tx({ id: 'fee', kind: 'transfer', amount: m(1000), fee: m(30), toAccountId: 'acc2' })]
  const report = buildIncomeExpenseStatement(statementInput({ balanceOnlyLedger, endNetWorth: m(-30) }))
  assert.equal(report.reconciliation.other, -30)
  assert.equal(report.reconciliation.difference, 0)

  const mismatch = buildIncomeExpenseStatement(statementInput({
    ledger: [tx({ id: 't1', kind: 'income', amount: m(1000), categoryId: 'salary' })],
    endNetWorth: m(800),
  }))
  assert.equal(mismatch.reconciliation.difference, -200)
})

test('收支表对账条：不计收支净效应、平账与早于开户日的流量分别计入 other', () => {
  const base = statementInput({
    balanceOnlyLedger: [
      tx({ id: 'x1', kind: 'expense', amount: m(200), excludeFromIncomeExpense: true }),
      tx({ id: 'x2', kind: 'adjustment', amount: m(50) }),
    ],
  })
  const excluded = buildIncomeExpenseStatement(base).reconciliation.other
  const included = buildIncomeExpenseStatement({ ...base, includeExcluded: true }).reconciliation.other
  // 不计收支在 includeExcluded=false 时才进 other，两态差值即该笔的账户净效应
  assert.equal(included - excluded, 200)

})

// ===== 分类树（两份 buildTree 合并后的唯一骨架） =====

test('分类树基线：父子层级、空节点跳过、hasChildren 看真实层级、按 sort 稳定排序', () => {
  const categories: CategoryRef[] = [
    cat('root-b', '后', 'income', 2),
    cat('root-a', '先', 'income', 0),
    cat('child', '子', 'income', 0, 'root-b'),
    cat('empty', '空', 'income', 1),
  ]
  const own = new Map([['child', m(100)], ['root-a', m(50)]])
  const tree = buildCategoryTree(categories, 'income', (category, children, hasChildren) => {
    const value = own.get(category.id) ?? m(0)
    if (value === 0 && children.length === 0) return null
    return {
      id: category.id,
      hasChildren,
      total: value + children.reduce((acc, child) => acc + child.total, 0),
    }
  })
  assert.deepEqual(snap(tree), [
    { id: 'root-a', hasChildren: false, total: 50 },
    { id: 'root-b', hasChildren: true, total: 100 },
  ])
  // 收入与支出共用同一骨架：切换 type 后只处理对应类型的分类
  assert.deepEqual(buildCategoryTree(categories, 'expense', () => ({ id: 'x' })), [])
})

// ===== 三来源投影 =====

test('投影基线：逐桶三来源、planned=null 语义、顶层合计与 hasFuture', () => {
  const output = buildIncomeExpenseProjection({
    buckets: BUCKETS,
    actualLedger: [tx({ id: 'a1', kind: 'income', amount: m(1000), date: D('2026-01-01') })],
    committedLedger: [tx({ id: 'c1', kind: 'expense', amount: m(200), date: D('2026-01-02') })],
    plannedLedger: [tx({ id: 'p1', kind: 'income', amount: m(500), date: D('2026-01-03') })],
    categories: [],
    uncategorizedLabel: '未分类',
    includeExcluded: false,
    covered: [] as CoveredOccurrence[],
  })
  assert.deepEqual(snap(output.points[0]!.income), { actual: 1000, committed: 0, planned: null, total: 1000 })
  assert.deepEqual(snap(output.points[1]!.expense), { actual: 0, committed: 200, planned: null, total: 200 })
  assert.deepEqual(snap(output.points[2]!.income), { actual: 0, committed: 0, planned: 500, total: 500 })
  assert.deepEqual(snap(output.income), { actual: 1000, committed: 0, planned: 500, total: 1500 })
  assert.deepEqual(snap(output.expense), { actual: 0, committed: 200, planned: null, total: 200 })
  assert.deepEqual(snap(output.balance), { actual: 1000, committed: -200, planned: 500, total: 1300 })
  assert.equal(output.hasFuture, true)
  assert.equal(output.incomeCategoryDetails.find((n) => n.categoryId === 'uncategorized')?.total, 1000)
})

test('投影基线：无未来事件时 hasFuture=false、points 全为 actual、无分类节点', () => {
  const output = buildIncomeExpenseProjection({
    buckets: BUCKETS,
    actualLedger: [tx({ id: 'a1', kind: 'expense', amount: m(300), date: D('2026-01-01') })],
    committedLedger: [],
    plannedLedger: [],
    categories: CATEGORIES,
    uncategorizedLabel: '未分类',
    includeExcluded: false,
    covered: [] as CoveredOccurrence[],
  })
  assert.equal(output.hasFuture, false)
  assert.equal(output.points.length, 3)
  assert.deepEqual(snap(output.points[0]!.expense), { actual: 300, committed: 0, planned: null, total: 300 })
  assert.equal(output.expense.actual, 300)
  assert.equal(output.incomeCategoryDetails.length, 0)
})

test('投影分类树：子树 planned 汇总、hasBudget 与 total 口径', () => {
  const categories: CategoryRef[] = [
    cat('root', '父', 'expense', 0),
    cat('child', '子', 'expense', 0, 'root'),
  ]
  const output = buildIncomeExpenseProjection({
    buckets: BUCKETS,
    actualLedger: [tx({ id: 'a1', kind: 'expense', amount: m(100), date: D('2026-01-01'), categoryId: 'child' })],
    committedLedger: [tx({ id: 'c1', kind: 'expense', amount: m(20), date: D('2026-01-02'), categoryId: 'root' })],
    plannedLedger: [],
    categories,
    uncategorizedLabel: '未分类',
    includeExcluded: false,
    covered: [] as CoveredOccurrence[],
  })
  const root = output.expenseCategoryDetails.find((n) => n.categoryId === 'root')
  assert.equal(root?.hasChildren, true)
  assert.equal(root?.actual, 100)
  assert.equal(root?.committed, 20)
  assert.equal(root?.planned, null)
  assert.equal(root?.total, 120)
  assert.equal(root?.hasBudget, false)
  assert.equal(root?.children?.[0]?.actual, 100)
})
