import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregate,
  buildProjectionActivity,
  buildSankey,
  buildStatement,
  cashFlowOf,
  minor,
  type LedgerTransaction,
  type LocalDate,
  type Minor,
  type ProcessedTx,
  type SankeySourceTransaction,
} from '../src/index.js'

const m = (value: number): Minor => minor(value)
const D = (value: string): LocalDate => value as LocalDate
const snap = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const tx = (overrides: Partial<ProcessedTx> = {}): ProcessedTx => ({
  isPredicted: false,
  type: 'expense',
  relatedType: null,
  amount: m(100),
  fee: m(0),
  coupon: m(0),
  isFromCash: true,
  isToCash: false,
  categoryName: '餐饮',
  categoryId: 'food',
  parentId: null,
  level: 1,
  cashFlowType: 'operating',
  accountName: '现金',
  toAccountName: null,
  ...overrides,
})

const source = (overrides: Partial<SankeySourceTransaction> = {}): SankeySourceTransaction => ({
  isActual: true,
  type: 'expense',
  relatedType: null,
  amount: m(100),
  fee: m(0),
  coupon: m(0),
  isFromCash: true,
  isToCash: false,
  categoryName: '餐饮',
  accountName: '现金',
  toAccountName: null,
  ...overrides,
})

const ledgerTx = (overrides: Partial<LedgerTransaction> & { kind: LedgerTransaction['kind'] }): LedgerTransaction => ({
  id: overrides.id ?? 't1',
  kind: overrides.kind,
  date: D('2026-01-15'),
  amount: overrides.amount ?? m(100),
  fee: overrides.fee ?? m(0),
  coupon: overrides.coupon ?? m(0),
  accountId: overrides.accountId ?? 'cash-a',
  toAccountId: overrides.toAccountId ?? null,
  categoryId: null,
  relatedType: overrides.relatedType ?? null,
  excludeFromIncomeExpense: false,
})

// ===== 四活动桶聚合 =====

test('聚合基线：四桶判定、inflow 正 / outflow 负、按账户流与同名同向合并', () => {
  const flows = aggregate([
    tx({ type: 'income', amount: m(1000), categoryName: '工资', cashFlowType: 'operating' }),
    tx({ type: 'expense', amount: m(300) }),
    tx({ type: 'expense', amount: m(200), cashFlowType: 'investing', categoryName: '基金' }),
  ])
  assert.equal(flows.operating.inflow, 1000)
  assert.equal(flows.operating.outflow, -300)
  assert.equal(flows.investing.outflow, -200)
  assert.equal(flows.financing.inflow, 0)
  assert.deepEqual(snap(flows.flowByAccount['现金']), { inflow: 1000, outflow: -500 })
  assert.equal(flows.reconciliation, 0)

  const merged = aggregate([
    tx({ type: 'expense', amount: m(100), categoryName: '餐饮' }),
    tx({ type: 'expense', amount: m(50), categoryName: '餐饮' }),
  ])
  assert.equal(merged.operating.items.length, 1)
  assert.equal(merged.operating.items[0]!.amount, -150)
  assert.equal(merged.operating.items[0]!.type, 'expense')
})

test('聚合基线：退款方向由原交易类型决定、不明类型跳过、平账只进 reconciliation', () => {
  const expenseRefund = aggregate([tx({ type: 'refund', relatedType: 'expense', amount: m(30) })])
  assert.equal(expenseRefund.operating.inflow, 30)
  assert.equal(expenseRefund.operating.outflow, 0)
  assert.equal(expenseRefund.flowByAccount['现金']!.inflow, 30)

  const incomeRefund = aggregate([tx({ type: 'refund', relatedType: 'income', amount: m(30) })])
  assert.equal(incomeRefund.operating.outflow, -30)

  const unknown = aggregate([tx({ type: 'refund', relatedType: null, amount: m(30) })])
  assert.equal(unknown.operating.inflow, 0)
  assert.equal(unknown.operating.outflow, 0)

  const adjustment = aggregate([
    tx({ type: 'adjustment', amount: m(500), cashFlowType: 'investing' }),
    tx({ type: 'adjustment', amount: m(-200), cashFlowType: 'financing' }),
  ])
  assert.equal(adjustment.reconciliation, 300)
  assert.equal(adjustment.operating.inflow, 0)
  assert.equal(adjustment.investing.inflow, 0)
  assert.equal(adjustment.financing.inflow, 0)
})

test('聚合基线：转账单边分派用规则取额，现金→现金本金相消、只记手续费', () => {
  const out = aggregate([tx({
    type: 'transfer', amount: m(1000), fee: m(30), isFromCash: true, isToCash: false,
    categoryName: '', toAccountName: null,
  })])
  assert.equal(out.operating.outflow, -1030)
  assert.equal(out.operating.items[0]!.type, 'transfer_out')
  assert.equal(out.operating.items[0]!.categoryName, '未分类')

  const into = aggregate([tx({
    type: 'transfer', amount: m(1000), isFromCash: false, isToCash: true,
    categoryName: '', toAccountName: '银行卡',
  })])
  assert.equal(into.operating.inflow, 1000)
  assert.equal(into.flowByAccount['银行卡']!.inflow, 1000)

  const internal = aggregate([tx({
    type: 'transfer', amount: m(1000), fee: m(30), isFromCash: true, isToCash: true,
    categoryName: '', toAccountName: '银行卡',
  })])
  assert.equal(internal.operating.inflow, 0)
  assert.equal(internal.operating.outflow, -30)
  assert.equal(internal.operating.items.length, 1)
  assert.equal(internal.operating.items[0]!.categoryName, '手续费')
  assert.equal(internal.reconciliation, 0)
})

// ===== 报表主体 =====

test('报表基线：四桶汇总、net = inflow + outflow、平账单列、按账户流合并两侧', () => {
  const actual = aggregate([
    tx({ type: 'income', amount: m(1000), categoryName: '工资' }),
    tx({ type: 'expense', amount: m(300) }),
    tx({ type: 'adjustment', amount: m(50) }),
  ])
  const predicted = aggregate([tx({
    type: 'expense', amount: m(200), isPredicted: true, categoryName: '预算支出',
  })])
  const statement = buildStatement(actual, predicted)
  assert.deepEqual(snap(statement.cashInflow), { actual: 1000, predicted: 0 })
  assert.deepEqual(snap(statement.cashOutflow), { actual: -300, predicted: -200 })
  assert.deepEqual(snap(statement.netCashFlow), { actual: 700, predicted: -200 })
  assert.deepEqual(snap(statement.reconciliation), { actual: 50, predicted: 0 })
  assert.deepEqual(snap(statement.byActivity.operating.net), { actual: 700, predicted: -200 })
  assert.deepEqual(snap(statement.flowByAccount['现金']), {
    inflow: { actual: 1000, predicted: 0 },
    outflow: { actual: -300, predicted: -200 },
  })
  assert.equal(statement.byActivity.operating.items.length, 3)
})

test('投影活动基线：三来源合并、planned=null 语义、outflow 翻正', () => {
  const actual = aggregate([tx({ type: 'income', amount: m(1000), categoryName: '工资' })])
  const committed = aggregate([tx({ type: 'income', amount: m(200), categoryName: '工资' })])
  const planned = aggregate([tx({ type: 'expense', amount: m(300), isPredicted: true, categoryName: '房租' })])
  const byActivity = buildProjectionActivity(actual, committed, planned)
  assert.deepEqual(snap(byActivity.operating.inflow), { actual: 1000, planned: 0, committed: 200, total: 1200 })
  assert.deepEqual(snap(byActivity.operating.outflow), { actual: 0, planned: 300, committed: 0, total: 300 })
  assert.deepEqual(snap(byActivity.operating.net), { actual: 1000, planned: -300, committed: 200, total: 900 })
  const rent = byActivity.operating.items.find((item) => item.categoryName === '房租')
  assert.equal(rent?.planned, -300)
  assert.equal(rent?.total, -300)
  const salary = byActivity.operating.items.find((item) => item.categoryName === '工资')
  assert.equal(salary?.planned, null)
  assert.equal(salary?.total, 1200)
})

// ===== 桑基 =====

test('桑基基线：退款方向与聚合同源、金额锁定、识别不了的原类型不计入', () => {
  const inflow = buildSankey([source({ type: 'refund', relatedType: 'expense', categoryName: null })])
  assert.equal(inflow.links.length, 1)
  assert.equal(inflow.links[0]!.source, '退款_income')
  assert.equal(inflow.links[0]!.target, '现金_cash')
  assert.equal(inflow.links[0]!.value, 100)
  assert.equal(inflow.links[0]!.actualValue, 100)

  const outflow = buildSankey([source({ type: 'refund', relatedType: 'income', categoryName: null })])
  assert.equal(outflow.links[0]!.source, '现金_cash')
  assert.equal(outflow.links[0]!.target, '退款_expense')

  assert.equal(buildSankey([source({ type: 'refund', relatedType: null }) ]).links.length, 0)
})

test('桑基基线：现金→现金本金可见、手续费单列，actual/predicted 两侧合并', () => {
  const result = buildSankey([source({
    type: 'transfer', amount: m(100), fee: m(10), isFromCash: true, isToCash: true,
    categoryName: null, accountName: '微信零钱', toAccountName: '支付宝',
  })])
  const principal = result.links.find((link) => link.source === '微信零钱_cash' && link.target === '支付宝_cash')
  assert.equal(principal?.value, 100)
  const fee = result.links.find((link) => link.target === '手续费_expense')
  assert.equal(fee?.value, 10)
  assert.deepEqual(result.nodes.map((node) => node.category), [
    'cash', 'cash', 'expense_category',
  ])
})

// ===== 验收：现金→现金划转三条链路对「现金净变化」的答案一致 =====

test('三链路一致性：本金相消，手续费在活动桶 / 桑基 / 推演里都记为流出', () => {
  const amount = m(1000)
  const fee = m(30)

  const flows = aggregate([tx({
    type: 'transfer', amount, fee, isFromCash: true, isToCash: true,
    categoryName: '', accountName: '微信零钱', toAccountName: '支付宝',
  })])
  assert.equal(flows.operating.inflow, 0)
  // 手续费跟随交易分类的 cashFlowType 分桶（本用例默认 operating）
  assert.equal(flows.operating.outflow, -30)
  assert.equal(flows.operating.items[0]?.categoryName, '手续费')
  assert.equal(flows.uncategorized.outflow, 0)

  // 对账等式：netCashFlow + reconciliation === cashChange（无平账时即等于现金变化）
  const statement = buildStatement(flows, aggregate([]))
  assert.equal(statement.netCashFlow.actual, -30)
  assert.equal(statement.reconciliation.actual, 0)
  assert.deepEqual(snap(statement.flowByAccount['微信零钱']), {
    inflow: { actual: 0, predicted: 0 },
    outflow: { actual: -30, predicted: 0 },
  })

  // 本金表现仍按视图粒度分叉：桑基画账户间链路，活动桶与推演都不记本金
  const sankey = buildSankey([source({
    type: 'transfer', amount, fee, isFromCash: true, isToCash: true,
    categoryName: null, accountName: '微信零钱', toAccountName: '支付宝',
  })])
  assert.equal(
    sankey.links.find((link) => link.source === '微信零钱_cash' && link.target === '支付宝_cash')?.value,
    1000,
  )
  assert.equal(sankey.links.find((link) => link.target === '手续费_expense')?.value, 30)

  const cash = cashFlowOf(ledgerTx({
    kind: 'transfer', amount, fee, accountId: 'cash-a', toAccountId: 'cash-b',
  }), new Set(['cash-a', 'cash-b']))
  assert.equal(cash.inflow, 0)
  assert.equal(cash.outflow, 30)

  assert.equal(statement.netCashFlow.actual + statement.reconciliation.actual, cash.inflow - cash.outflow)

  // 免手续费时三条链路都不产生金额变化，但表现形式仍各自不同
  const free = cashFlowOf(ledgerTx({
    kind: 'transfer', amount, accountId: 'cash-a', toAccountId: 'cash-b',
  }), new Set(['cash-a', 'cash-b']))
  assert.equal(free.inflow, 0)
  assert.equal(free.outflow, 0)
})
