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
  cashFlowType: 'operating',
  isFromCash: true,
  isToCash: false,
  categoryName: '餐饮',
  categoryId: 'food',
  accountName: '现金',
  accountId: 'cash-a',
  toAccountName: null,
  toAccountId: null,
  categoryGroupId: 'grp-cat-food',
  categoryGroupName: '餐饮',
  accountGroupId: 'grp-acct-cash',
  accountGroupName: '现金账户',
  toAccountGroupId: null,
  toAccountGroupName: null,
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
  assert.equal(inflow.links[0]!.source, 'in:food')
  assert.equal(inflow.links[0]!.target, 'acct:cash-a')
  assert.equal(inflow.links[0]!.value, 100)
  assert.equal(inflow.links[0]!.actualValue, 100)

  const outflow = buildSankey([source({ type: 'refund', relatedType: 'income', categoryName: null })])
  assert.equal(outflow.links[0]!.source, 'acct:cash-a')
  assert.equal(outflow.links[0]!.target, 'out:food')

  assert.equal(buildSankey([source({ type: 'refund', relatedType: null }) ]).links.length, 0)
})

test('桑基基线：现金→现金本金可见、手续费单列，actual/predicted 两侧合并', () => {
  const result = buildSankey([source({
    type: 'transfer', amount: m(100), fee: m(10), isFromCash: true, isToCash: true,
    categoryName: null, accountName: '微信零钱', accountId: 'wx',
    toAccountName: '支付宝', toAccountId: 'zfb',
  })])
  const principal = result.links.find((link) => link.source === 'acct:wx' && link.target === 'acct:zfb')
  assert.equal(principal?.value, 100)
  const fee = result.links.find((link) => link.target === 'out:synthetic:fee')
  assert.equal(fee?.value, 10)
  assert.deepEqual(result.nodes.map((node) => node.nodeType), [
    'cash', 'cash', 'expense_category',
  ])
})

// ===== 桑基 endpoint 契约：身份与展示名解耦、同名实体不合并、无 suffix 身份 =====

test('桑基身份与展示名解耦：改名不改变 id / nodeType / side', () => {
  const base = { type: 'expense' as const, categoryName: '餐饮', categoryId: 'cat-food' }
  const before = buildSankey([source(base)])
  const after = buildSankey([source({ ...base, categoryName: '改了名字的餐饮' })])

  assert.equal(before.nodes.length, 2) // 分类 in + 账户 acct
  assert.equal(after.nodes.length, 2)
  const categoryBefore = before.nodes.find((node) => node.nodeType === 'expense_category')!
  const categoryAfter = after.nodes.find((node) => node.nodeType === 'expense_category')!
  assert.equal(categoryBefore.id, 'out:cat-food')
  assert.equal(categoryAfter.id, 'out:cat-food')
  assert.equal(categoryBefore.id, categoryAfter.id)
  assert.equal(categoryBefore.nodeType, categoryAfter.nodeType)
  assert.equal(categoryBefore.side, categoryAfter.side)
  assert.equal(categoryBefore.side, 'out')
  assert.equal(categoryAfter.name, '改了名字的餐饮')
})

test('桑基同名实体不合并：两个同名分类、两个同名账户各自独立', () => {
  const result = buildSankey([
    source({ type: 'expense', categoryName: '餐饮', categoryId: 'food-a', accountName: '现金', accountId: 'acc-a', amount: m(100) }),
    source({ type: 'expense', categoryName: '餐饮', categoryId: 'food-b', accountName: '现金', accountId: 'acc-b', amount: m(200) }),
  ])
  const categories = result.nodes.filter((node) => node.nodeType === 'expense_category')
  const accounts = result.nodes.filter((node) => node.nodeType === 'cash')
  assert.deepEqual(categories.map((node) => node.id).sort(), ['out:food-a', 'out:food-b'])
  assert.deepEqual(accounts.map((node) => node.id).sort(), ['acct:acc-a', 'acct:acc-b'])
  // 同名分类 / 账户的金额各自归到自己的 id，不混在一起
  assert.equal(result.links.find((link) => link.target === 'out:food-a')?.value, 100)
  assert.equal(result.links.find((link) => link.target === 'out:food-b')?.value, 200)
})

test('桑基 endpoint 全部字段结构化：id 不带 name 后缀，name 仅展示', () => {
  const result = buildSankey([
    source({ type: 'income', categoryName: '工资', categoryId: 'salary', amount: m(100) }),
    source({ type: 'transfer', categoryName: '互转', categoryId: 'move', isFromCash: false, isToCash: true,
      accountName: '股票', accountId: 'sec', toAccountName: '微信', toAccountId: 'wx' }),
  ])
  for (const node of result.nodes) {
    assert.ok(
      node.nodeType === 'income_category' ||
      node.nodeType === 'expense_category' ||
      node.nodeType === 'cash' ||
      node.nodeType === 'non_cash_source' ||
      node.nodeType === 'non_cash_target',
    )
    assert.ok(node.side === 'in' || node.side === 'account' || node.side === 'out')
    for (const suffix of ['_income', '_expense', '_cash', '_ncs', '_nct']) {
      assert.equal(node.id.endsWith(suffix), false, `id 不得编码 suffix: ${node.id}`)
    }
  }
  assert.ok(result.nodes.some((node) => node.id === 'in:salary' && node.name === '工资'))
  assert.ok(result.nodes.some((node) => node.nodeType === 'non_cash_source' && node.side === 'in'))
})

test('桑基非现金节点名只用账户名，不拼交易分类名（渐进式分组前置）', () => {
  const inflow = buildSankey([source({
    type: 'transfer', isFromCash: false, isToCash: true,
    categoryName: '账户互转', categoryId: 'move',
    accountName: '长桥证券', accountId: 'brk',
    toAccountName: '微信零钱', toAccountId: 'wx',
  })])
  const sourceNode = inflow.nodes.find((node) => node.nodeType === 'non_cash_source')!
  assert.equal(sourceNode.name, '长桥证券')
  assert.equal(sourceNode.name.includes('账户互转'), false)

  const outflow = buildSankey([source({
    type: 'transfer', isFromCash: true, isToCash: false,
    categoryName: '账户互转', categoryId: 'move',
    accountName: '微信零钱', accountId: 'wx',
    toAccountName: '长桥证券', toAccountId: 'brk',
  })])
  const targetNode = outflow.nodes.find((node) => node.nodeType === 'non_cash_target')!
  assert.equal(targetNode.name, '长桥证券')
  assert.equal(targetNode.name.includes('账户互转'), false)
})

test('桑基 endpoint 分组元数据：真实实体带 group、合成节点为 null、expandable 按组内数量', () => {
  const result = buildSankey([
    source({ type: 'expense', categoryName: '午餐', categoryId: 'lunch',
      categoryGroupId: 'grp:cat:out:food', categoryGroupName: '餐饮', amount: m(100) }),
    source({ type: 'expense', categoryName: '外食', categoryId: 'takeout',
      categoryGroupId: 'grp:cat:out:food', categoryGroupName: '餐饮', amount: m(200) }),
    source({ type: 'transfer', isFromCash: false, isToCash: true,
      accountName: '证券', accountId: 'sec', accountGroupId: 'grp:acct:inv', accountGroupName: '投资',
      toAccountName: '微信', toAccountId: 'wx', toAccountGroupId: 'grp:acct:cash', toAccountGroupName: '现金' }),
  ])
  const lunch = result.nodes.find((node) => node.id === 'out:lunch')!
  const takeout = result.nodes.find((node) => node.id === 'out:takeout')!
  assert.deepEqual(lunch.group, { id: 'out:grp:cat:out:food', name: '餐饮', expandable: true })
  assert.deepEqual(takeout.group, { id: 'out:grp:cat:out:food', name: '餐饮', expandable: true })

  const ncs = result.nodes.find((node) => node.nodeType === 'non_cash_source')!
  assert.deepEqual(ncs.group, { id: 'in:grp:acct:inv', name: '投资', expandable: false })

  // 同一账户分类出现在左右两列时必须各成一组，不能被投影合并成一个节点。
  const outflow = buildSankey([source({
    type: 'transfer', isFromCash: true, isToCash: false,
    accountName: '微信', accountId: 'wx', accountGroupId: 'grp:acct:cash', accountGroupName: '现金',
    toAccountName: '证券', toAccountId: 'sec', toAccountGroupId: 'grp:acct:inv', toAccountGroupName: '投资',
  })])
  const nct = outflow.nodes.find((node) => node.nodeType === 'non_cash_target')!
  assert.deepEqual(nct.group, { id: 'out:grp:acct:inv', name: '投资', expandable: false })

  // 手续费合成节点 group 为 null
  const withFee = buildSankey([source({ type: 'transfer', isToCash: true, fee: m(10),
    toAccountName: '支付宝', toAccountId: 'zfb',
    accountGroupId: 'grp:acct:cash', accountGroupName: '现金',
    toAccountGroupId: 'grp:acct:cash', toAccountGroupName: '现金' })])
  const feeNode = withFee.nodes.find((node) => node.id === 'out:synthetic:fee')
  assert.ok(feeNode)
  assert.equal(feeNode!.group, null)
})

test('桑基链路保留现金流活动身份，同一对端点按活动拆成多条', () => {
  const result = buildSankey([
    source({ type: 'income', categoryId: 'sale', categoryName: '销售收入', cashFlowType: 'operating',
      categoryGroupId: 'grp-op', categoryGroupName: '经营', amount: m(100) }),
    source({ type: 'income', categoryId: 'dividend', categoryName: '分红', cashFlowType: 'investing',
      categoryGroupId: 'grp-inv', categoryGroupName: '投资', amount: m(200) }),
    source({ type: 'expense', categoryId: 'interest', categoryName: '利息', cashFlowType: 'financing',
      categoryGroupId: 'grp-fin', categoryGroupName: '筹资', amount: m(30) }),
  ])
  const byActivity = new Map(result.links.map((link) => [`${link.source}>${link.target}`, link.activity]))
  assert.equal(byActivity.get('in:sale>acct:cash-a'), 'operating')
  assert.equal(byActivity.get('in:dividend>acct:cash-a'), 'investing')
  assert.equal(byActivity.get('acct:cash-a>out:interest'), 'financing')

  // 同一对端点来自不同活动时不合并，各自带身份；同活动仍合并。
  const merged = buildSankey([
    source({ type: 'income', categoryId: 'sale', categoryName: '销售', cashFlowType: 'operating', amount: m(100) }),
    source({ type: 'income', categoryId: 'service', categoryName: '服务', cashFlowType: 'operating', amount: m(50) }),
  ])
  const cashLinks = merged.links.filter((link) => link.target === 'acct:cash-a')
  assert.equal(cashLinks.length, 2)
  assert.deepEqual([...new Set(cashLinks.map((link) => link.activity))], ['operating'])

  // 内部转账 / 手续费为非收支活动，activity 为 null。
  const internal = buildSankey([source({ type: 'transfer', isFromCash: true, isToCash: true, fee: m(10),
    accountId: 'wx', accountName: '微信', toAccountId: 'zfb', toAccountName: '支付宝' })])
  assert.ok(internal.links.every((link) => link.activity === null))
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
    categoryName: null, accountName: '微信零钱', accountId: 'wx',
    toAccountName: '支付宝', toAccountId: 'zfb',
  })])
  assert.equal(
    sankey.links.find((link) => link.source === 'acct:wx' && link.target === 'acct:zfb')?.value,
    1000,
  )
  assert.equal(sankey.links.find((link) => link.target === 'out:synthetic:fee')?.value, 30)

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
