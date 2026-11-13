/**
 * 报表页 API 接入断言（本批）
 *
 * 覆盖用户验收要求：
 * - 四个视图 ← 端点 ← 字段的映射（源码层 + 适配器数值层）
 * - 期间边界：页面合计直接等于后端返回，月初 / 月末两笔都计入
 * - 桑基守恒：真数据适配后逐月差值 0；退款冲减流入时仍守恒
 * - 配置生效：分组 / 隐藏分组 / 排序在 API 数据上仍改变展示
 * - 无写调用：reports 目录下全部源码不引用任何 POST / PUT / DELETE
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { render } from '@testing-library/react'
import {
  ledgerAnchorDay,
  type Ledger,
  type LedgerAccountCategory,
  type LedgerTransaction,
} from '@/features/overview/model'
import { createSeedLedger } from '@/dev-fixtures/seed'
import {
  mapBalanceReport,
  mapCashReport,
  mapFlowReport,
  mapInvestmentReport,
} from '@/features/reports/apiReports'
import {
  assertCashSankeyConservation,
  deriveCashSankey,
} from '@/features/reports/cashSankeyModel'
import { CashSankeyChart } from '@/features/reports/CashSankey'
import { balanceGroupBalanced, buildBalanceGroups, buildBalanceTrees } from '@/features/reports/reportsModel'
import { isExpanded } from '@/features/shared/foldState'
import {
  DEFAULT_REPORT_SETTINGS,
  normalizeReportSettings,
  sliceSnapshots,
} from '@/features/reports/reportSettings'

const webSrc = resolve(__dirname, '../../src')

/** 报表固定显示全部活动分组；桑基的隐藏分组能力仍由底层测试覆盖。 */
const ALL_VISIBLE = {}

function source(relative: string): string {
  return readFileSync(resolve(webSrc, relative), 'utf8')
}

function ledgerWith(transactions: LedgerTransaction[], today?: string): Ledger {
  return {
    ...createSeedLedger(),
    transactions,
    ...(today ? { snapshot: { ...(createSeedLedger().snapshot ?? {}), today } as never } : {}),
  }
}

/** 与 CASH_FLOW.sankey 对齐的 API 账本：期初 482,620 → 期末 500,220。 */
function cashConsistentLedger(): Ledger {
  const transactions = [
    tx({ id: 'c1', date: '2026-11-02', amount: 50000, type: 'transfer', categoryId: 'move', accountId: 'cmb', toAccountId: 'wx' }),
    tx({ id: 'c2', date: '2026-11-03', amount: 31200, categoryId: 'edu', accountId: 'wx' }),
    // 收入退款：钱流出账户，后端桑基归到支出侧，和 start / end 现金一致。
    tx({ id: 'c3', date: '2026-11-04', amount: 1200, type: 'refund', relatedType: 'income', categoryId: 'refund', accountId: 'wx' }),
  ]
  const base = ledgerWith(transactions)
  // wx 当前余额 = 128620 + 50000 − 31200 − 1200。
  return {
    ...base,
    accounts: base.accounts.map((account) => (account.id === 'wx' ? { ...account, balance: 146220 } : account)),
  }
}

function tx(partial: Partial<LedgerTransaction> & Pick<LedgerTransaction, 'id' | 'date'>): LedgerTransaction {
  return {
    type: 'expense',
    amount: 0,
    categoryId: 'food',
    accountId: 'wx',
    note: '',
    ...partial,
  } as LedgerTransaction
}

const BALANCE = {
  date: '2026-11-06',
  assets: { actual: 15172915, predicted: 0 },
  liabilities: { actual: 211840, predicted: 0 },
  netWorth: { actual: 14961075, predicted: 0 },
  assetNodes: [
    {
      id: 'ac-savings',
      name: '储蓄卡',
      actual: 6027695,
      children: [{ id: 'cmb', name: '招商储蓄卡', actual: 6027695 }],
    },
    {
      id: 'ac-cash',
      name: '现金等价',
      actual: 500220,
      children: [
        { id: 'wx', name: '微信零钱', actual: 124020 },
        { id: 'zfb', name: '支付宝', actual: 376200 },
      ],
    },
    {
      id: 'ac-invest',
      name: '投资账户',
      actual: 8645000,
      children: [{ id: 'brk', name: '长桥证券', actual: 8645000 }],
    },
  ],
  liabilityNodes: [
    {
      id: 'ac-credit',
      name: '信用账户',
      actual: 211840,
      children: [{ id: 'xyk', name: '交行信用卡', actual: 211840 }],
    },
  ],
} as never

/**
 * 真实库 3,291 笔（2026-11-06）的资产负债快照：
 * 资产 754,745.63 = 正余额资产 882,603.34 + 负余额资产 -127,857.71；
 * 5 个负债账户合计 16,030.15（这些账户在库里余额为正，表示欠款）；
 * 净资产 738,715.48 = 资产 − 负债；负债 + 权益 = 资产。
 */
const REAL_BALANCE = {
  date: '2026-11-06',
  assets: { actual: 75474563, predicted: 0 },
  liabilities: { actual: 1603015, predicted: 0 },
  netWorth: { actual: 73871548, predicted: 0 },
  assetNodes: [
    {
      id: 'ac-cash',
      name: '现金',
      actual: 5107551,
      children: [
        { id: 'a-ysf', name: '云闪付', actual: 6046455 },
        { id: 'a-wx', name: '微信', actual: -582436 },
        { id: 'a-zfb', name: '支付宝', actual: -359268 },
        { id: 'a-wallet', name: '钱包', actual: 2800 },
        { id: 'a-cash-zero', name: '现金', actual: 0 },
        { id: 'a-wallet-zero', name: '备用钱包', actual: 0 },
      ],
    },
    {
      id: 'ac-other',
      name: '资产',
      actual: -9016838,
      children: [{ id: 'a-gjj', name: '公积金', actual: -9016838 }],
    },
    {
      id: 'ac-invest',
      name: '投资',
      actual: 79383850,
      children: [
        { id: 'a-xq', name: '雪球基金', actual: 82211079 },
        { id: 'a-zfbjj', name: '支付宝基金', actual: -2827229 },
      ],
    },
  ],
  liabilityNodes: [
    {
      id: 'lc-credit',
      name: '负债',
      actual: 1603015,
      children: [
        { id: 'l1', name: '花呗', actual: 832785 },
        { id: 'l2', name: '京东白条', actual: 699188 },
        { id: 'l3', name: '广发银行', actual: 67680 },
        { id: 'l4', name: '微信分付', actual: 2899 },
        { id: 'l5', name: '民生银行', actual: 463 },
      ],
    },
  ],
} as never

/**
 * 真实库 3,380 笔（2026-10-31）快照：13 账户，账户直接挂 4 个一级分类。
 * 资产 1,116,868.88、负债 1,316.40、净资产 1,115,552.48；0 元账户（现金 / 未报账项 /
 * 京东白条 / 1688）不在明细行里。
 */
const REAL_BALANCE_20261031 = {
  date: '2026-10-31',
  assets: { actual: 111686888, predicted: 0 },
  liabilities: { actual: 131640, predicted: 0 },
  netWorth: { actual: 111555248, predicted: 0 },
  assetNodes: [
    {
      id: 'acg-liquid',
      name: '流动资产',
      actual: 10113147,
      children: [
        { id: 'acc-alipay', name: '支付宝', categoryId: 'acg-liquid', actual: 968142 },
        { id: 'acc-wechat', name: '微信', categoryId: 'acg-liquid', actual: 12482 },
        { id: 'acc-unionpay', name: '云闪付', categoryId: 'acg-liquid', actual: 9132523 },
        { id: 'acc-cash', name: '现金', categoryId: 'acg-liquid', actual: 0 },
      ],
    },
    {
      id: 'acg-provident',
      name: '公积金',
      actual: 100,
      children: [{ id: 'acc-provident', name: '公积金', categoryId: 'acg-provident', actual: 100 }],
    },
    {
      id: 'acg-investment',
      name: '金融资产',
      actual: 101573641,
      children: [
        { id: 'acc-xueqiu', name: '雪球基金', categoryId: 'acg-investment', actual: 91509259 },
        {
          id: 'acc-alipay-fund',
          name: '支付宝基金',
          categoryId: 'acg-investment',
          actual: 10064382,
        },
      ],
    },
    {
      id: 'acg-receivable',
      name: '应收账款',
      actual: 0,
      children: [
        { id: 'acc-unreported', name: '未报账项', categoryId: 'acg-receivable', actual: 0 },
      ],
    },
  ],
  liabilityNodes: [
    {
      id: 'acg-credit',
      name: '信用负债',
      actual: 131640,
      children: [
        { id: 'acc-minsheng', name: '民生银行', categoryId: 'acg-credit', actual: 39786 },
        { id: 'acc-huabei', name: '花呗', categoryId: 'acg-credit', actual: 47849 },
        { id: 'acc-jd-baitiao', name: '京东白条', categoryId: 'acg-credit', actual: 0 },
        { id: 'acc-meituan', name: '美团月付', categoryId: 'acg-credit', actual: 44005 },
        { id: 'acc-1688', name: '1688', categoryId: 'acg-credit', actual: 0 },
      ],
    },
  ],
} as never

/** 真实库的账户分类：资产 现金 / 长期 / 投资，负债 短期负债；账户直接挂一级。 */
const REAL_CATEGORIES: LedgerAccountCategory[] = [
  { id: 'acg-liquid', name: '现金', type: 'asset', parentId: null, sort: 0 },
  { id: 'acg-provident', name: '长期', type: 'asset', parentId: null, sort: 1 },
  { id: 'acg-investment', name: '投资', type: 'asset', parentId: null, sort: 2 },
  { id: 'acg-credit', name: '短期负债', type: 'liability', parentId: null, sort: 3 },
]

const TREND = [
  { label: '2026-10', netWorth: 13738835 },
  { label: '2026-11', netWorth: 14961075 },
]

const INCOME_EXPENSE = {
  income: { actual: 1850000 },
  expense: { actual: 627760 },
  balance: { actual: 1222240 },
  incomeCategoryDetails: [{ name: '工资', categoryId: 'salary', actual: 1850000, children: [] }],
  expenseCategoryDetails: [
    {
      name: '餐饮',
      categoryId: 'food',
      actual: 5300,
      children: [{ name: '午餐', categoryId: 'food_lunch', actual: 2800, children: [] }],
    },
    { name: '居住', categoryId: 'home', actual: 560000, children: [] },
  ],
} as never

const CASH_FLOW = {
  cashInflow: { actual: 48800 },
  cashOutflow: { actual: -31200 },
  startCash: { actual: 482620 },
  endCash: { actual: 500220 },
  byActivity: {
    operating: {
      inflow: { actual: -1200 },
      outflow: { actual: -31200 },
      net: { actual: -32400 },
      items: [
        { categoryName: '教育', categoryId: 'edu', actual: -19900, direction: 'outflow', type: 'expense' },
        { categoryName: '退款', categoryId: 'refund', actual: -1200, direction: 'inflow', type: 'refund' },
      ],
    },
    investing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
    financing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
    uncategorized: {
      inflow: { actual: 50000 },
      outflow: { actual: 0 },
      net: { actual: 50000 },
      items: [
        { categoryName: '账户互转', categoryId: 'move', actual: 50000, direction: 'inflow', type: 'transfer_in' },
      ],
    },
  },
  sankey: {
    nodes: [
      { name: '账户互转_ncs', category: 'non_cash_source' },
      { name: '退款_expense', category: 'expense_category' },
      { name: '教育_expense', category: 'expense_category' },
      { name: '其他_expense', category: 'expense_category' },
      { name: '微信零钱_cash', category: 'cash' },
    ],
    links: [
      { source: '账户互转_ncs', target: '微信零钱_cash', value: 50000, actualValue: 50000 },
      { source: '微信零钱_cash', target: '退款_expense', value: 1200, actualValue: 1200 },
      { source: '微信零钱_cash', target: '教育_expense', value: 19900, actualValue: 19900 },
      { source: '微信零钱_cash', target: '其他_expense', value: 11300, actualValue: 11300 },
    ],
  },
} as never

describe('视图 ↔ 端点映射', () => {
  it('四个视图各自调用对应报表端点，不拿流水重算合计', () => {
    const adapter = source('features/reports/apiReports.ts')
    expect(adapter).toContain('reportApi.getBalanceSheet')
    expect(adapter).toContain('analyticsApi.getAssetTrend')
    expect(adapter).toContain('reportApi.getIncomeExpense')
    expect(adapter).toContain('reportApi.getCashFlow')
    expect(adapter).toContain('reportApi.getInvestmentAnalysis')

    const api = source('services/api.ts')
    expect(api).toContain("'/reports/balance-sheet'")
    expect(api).toContain("'/analytics/asset-trend'")
    expect(api).toContain("'/reports/income-expense'")
    expect(api).toContain("'/reports/cash-flow'")
    expect(api).toContain("'/reports/investment-analysis'")
  })

  it('资产负债：账户行 / 合计 / 趋势都取自后端字段，信用卡不进资产环', () => {
    const ledger = createSeedLedger()
    const report = mapBalanceReport(BALANCE, TREND, ledger)
    const rows = [...report.assets, ...report.liabilities]
    expect(report.assetTotal).toBe(15172915)
    expect(report.liabilityTotal).toBe(211840)
    expect(report.netWorth).toBe(14961075)
    // 顺序沿用后端分类 / 账户顺序（即设置中的顺序），不再按金额降序。
    expect(report.assets.map((row) => row.id)).toEqual(['cmb', 'wx', 'zfb', 'brk'])
    expect(report.liabilities.map((row) => row.id)).toEqual(['xyk'])
    expect(rows.some((row) => row.id === 'xyk' && report.assets.includes(row))).toBe(false)
    expect(report.trend.at(-1)).toEqual({ month: '2026-11', value: 14961075 })

    // 资产环只取正数根节点：合计 = 各块之和，信用卡不在其中。
    const blocks = report.assets.filter((row) => row.amount > 0)
    expect(blocks.reduce((sum, row) => sum + row.amount, 0)).toBe(report.assetTotal)
    expect(blocks.every((row) => row.id !== 'xyk')).toBe(true)
  })

  it('负债表列出全部非零负债账户，负债 + 权益 = 资产（真实库 754,745.63 / 16,030.15）', () => {
    const report = mapBalanceReport(REAL_BALANCE, [{ label: '2026-11', netWorth: 73871548 }], createSeedLedger())
    // 5 个负债账户一个不少，合计等于后端总负债；不再被资产侧的 actual > 0 过滤成 0 行。
    expect(report.liabilities.map((row) => row.id)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5'])
    expect(report.liabilities.reduce((sum, row) => sum + row.amount, 0)).toBe(1603015)
    expect(report.liabilityTotal).toBe(1603015)
    // 三处净资产同口径：报表 / 资产走势 / 总览都取 资产 − 负债。
    expect(report.netWorth).toBe(73871548)
    expect(report.trend.at(-1)).toEqual({ month: '2026-11', value: 73871548 })
    // 净资产单列且不属于负债：资产 − 负债 = 净资产。
    expect(report.assetTotal - report.liabilityTotal).toBe(report.netWorth)
  })

  it('资产表覆盖全部非零账户：负余额保留、0 元账户折叠（真实库 7 行 + 2 个 0 元）', () => {
    const report = mapBalanceReport(REAL_BALANCE, [], createSeedLedger())
    // 负余额资产不再被 actual > 0 吞掉：7 个非零账户按后端分类 / 账户顺序列出。
    expect(report.assets.map((row) => row.id)).toEqual([
      'a-ysf',
      'a-wx',
      'a-zfb',
      'a-wallet',
      'a-gjj',
      'a-xq',
      'a-zfbjj',
    ])
    // 行合计与后端资产合计逐分相等；差额正是负余额账户。
    expect(report.assets.reduce((sum, row) => sum + row.amount, 0)).toBe(75474563)
    expect(report.positiveAssetTotal).toBe(88260334)
    expect(report.negativeAssetTotal).toBe(-12785771)
    expect(report.negativeAssetCount).toBe(4)
    // 0 元账户不进明细，但有可见计数（真实库为 16 个）。
    expect(report.zeroAccountCount).toBe(2)
  })

  it('资产构成为正余额口径：环内合计与资产表差额 = 负余额资产（真实库 882,603.34 / −127,857.71）', () => {
    const report = mapBalanceReport(REAL_BALANCE, [], createSeedLedger())
    // 差额逐分等于被排除的负余额资产，图注用同一组数字解释。
    expect(report.positiveAssetTotal).toBe(88260334)
    expect(report.positiveAssetTotal + report.negativeAssetTotal).toBe(report.assetTotal)
    expect(report.positiveAssetTotal - report.assetTotal).toBe(12785771)
    // 构成树一级是账户分类，二级是该分类下的账户；占比只按正余额计算。
    const trees = buildBalanceTrees(buildBalanceGroups(report.assets))
    expect(trees.length).toBeGreaterThan(0)
    expect(trees.every((tree) => tree.level === 0 && tree.children.length > 0)).toBe(true)
    expect(trees.every((tree) => tree.share >= 0)).toBe(true)
  })

  it('资产负债层级（真实库 2026-10-31）：三处对账逐项相等', () => {
    const ledger = { ...createSeedLedger(), accountCategories: REAL_CATEGORIES }
    const report = mapBalanceReport(REAL_BALANCE_20261031, [], ledger)
    // 资产表行合计 / 负债表行合计 / 净资产行，三处逐分相等。
    expect(report.assetTotal).toBe(111686888)
    expect(report.liabilityTotal).toBe(131640)
    expect(report.netWorth).toBe(111555248)
    expect(report.assets.reduce((sum, row) => sum + row.amount, 0)).toBe(report.assetTotal)
    expect(report.liabilities.reduce((sum, row) => sum + row.amount, 0)).toBe(report.liabilityTotal)
    expect(report.assetTotal - report.liabilityTotal).toBe(report.netWorth)
    // 负债区只有负债分类，没有所有者权益行。
    expect(report.liabilities.every((row) => row.id !== 'equity')).toBe(true)
  })

  it('层级小计：子项之和 = 父项小计，根级之和 = 资产 / 负债合计', () => {
    const ledger = { ...createSeedLedger(), accountCategories: REAL_CATEGORIES }
    const report = mapBalanceReport(REAL_BALANCE_20261031, [], ledger)
    const assetGroups = buildBalanceGroups(report.assets, REAL_CATEGORIES)
    const liabilityGroups = buildBalanceGroups(report.liabilities, REAL_CATEGORIES)
    for (const group of [...assetGroups, ...liabilityGroups]) {
      // 组内账户之和 = 分组小计（金额与账户数同时对齐）。
      expect(balanceGroupBalanced(group), `${group.name} 小计`).toBe(true)
    }
    expect(assetGroups.reduce((sum, group) => sum + group.amount, 0)).toBe(report.assetTotal)
    expect(liabilityGroups.reduce((sum, group) => sum + group.amount, 0)).toBe(report.liabilityTotal)
    // 账户数同样从一级对到明细；顺序沿用设置中的分类 sort，不再按金额降序。
    expect(assetGroups.map((group) => [group.name, group.accountCount])).toEqual([
      ['现金', 3],
      ['长期', 1],
      ['投资', 2],
    ])
    expect(assetGroups[0].accounts.map((account) => account.id)).toEqual([
      'acc-alipay',
      'acc-wechat',
      'acc-unionpay',
    ])
    expect(liabilityGroups.map((group) => [group.name, group.accountCount])).toEqual([
      ['短期负债', 3],
    ])
    // 账户直接挂一级，组内就是账户行。
    expect(assetGroups.every((group) => group.accounts.length === group.accountCount)).toBe(true)

    // 真实库里「现金」「投资」是「资产」的子分类：设置页把它们平铺成三个分组，
    // 报表必须同口径按每个账户自己的分类成组，不能向父级归并成一组「资产」。
    const nested = buildBalanceGroups(
      [
        { id: 'n1', name: '账户1', kind: '现金', amount: 100, categoryId: 'sub-cash' },
        { id: 'n2', name: '账户2', kind: '现金', amount: 50, categoryId: 'sub-cash' },
        { id: 'n3', name: '账户3', kind: '投资', amount: 200, categoryId: 'sub-invest' },
        { id: 'n4', name: '账户4', kind: '资产', amount: 30, categoryId: 'root-asset' },
      ],
      [
        { id: 'root-asset', name: '资产', type: 'asset', parentId: null, sort: 0 },
        { id: 'sub-cash', name: '现金', type: 'asset', parentId: 'root-asset', sort: 1 },
        { id: 'sub-invest', name: '投资', type: 'asset', parentId: 'root-asset', sort: 2 },
      ],
    )
    expect(nested.map((group) => group.name)).toEqual(['现金', '投资', '资产'])
    expect(nested.map((group) => group.amount)).toEqual([150, 200, 30])
    expect(nested.map((group) => group.accountCount)).toEqual([2, 1, 1])
    expect(nested.every(balanceGroupBalanced)).toBe(true)
  })

  it('层级默认折叠：只有显式展开过的分类才出账户行', () => {
    const rows = [
      { id: 'n1', name: '账户1', kind: '现金', amount: 100, categoryId: 'root-liquid' },
      { id: 'n2', name: '账户2', kind: '现金', amount: 50, categoryId: 'root-liquid' },
    ]
    const groups = buildBalanceGroups(rows, [
      { id: 'root-liquid', name: '现金', type: 'asset', parentId: null, sort: 1 },
    ])
    expect(isExpanded({}, groups[0].id)).toBe(false)
    expect(isExpanded({ [groups[0].id]: true }, groups[0].id)).toBe(true)
    expect(balanceGroupBalanced(groups[0])).toBe(true)

    // 账本缺 accountCategories 时按后端 assetNodes 的分类名兜底，表格仍有层级。
    const fallback = buildBalanceGroups(rows)
    expect(fallback).toHaveLength(1)
    expect(fallback[0].name).toBe('现金')
    expect(fallback[0].accountCount).toBe(2)
  })

  it('收支明细：合计 / 分类树来自后端，笔数取完整期间流水', () => {
    const transactions = [
      tx({ id: 't1', date: '2026-11-01', amount: 1850000, type: 'income', categoryId: 'salary', accountId: 'cmb' }),
      tx({ id: 't2', date: '2026-11-06', amount: 5300, categoryId: 'food' }),
      tx({ id: 't3', date: '2026-11-30', amount: 560000, categoryId: 'home', accountId: 'cmb' }),
      tx({ id: 't4', date: '2026-10-31', amount: 999, categoryId: 'food' }),
    ]
    const ledger = ledgerWith(transactions)
    const report = mapFlowReport(INCOME_EXPENSE, [{ label: '11月', income: 1850000, expense: 627760 }], ledger, '2026-11-01', '2026-11-06')
    expect(report.income).toBe(1850000)
    expect(report.expense).toBe(627760)
    expect(report.balance).toBe(1222240)
    expect(report.incomeTrees[0].count).toBe(1)
    expect(report.expenseTrees.find((node) => node.id === 'food')?.count).toBe(1)
    // 期间外（10-31）不计入笔数；月末 11-30 同理不计入 11-01~11-06。
    expect(report.expenseTrees.find((node) => node.id === 'home')?.count).toBe(0)
    expect(report.series[0]).toEqual({ label: '11月', income: 1850000, expense: 627760 })
  })

  it('现金流：合计 / 期初 / 期末 / 分组来自后端，退款冲减流入不制造负数分组', () => {
    const ledger = cashConsistentLedger()
    const report = mapCashReport(CASH_FLOW, ledger, '2026-11-01', '2026-11-06')
    expect(report.inflowTotal).toBe(48800)
    expect(report.outflowTotal).toBe(31200)
    expect(report.openingCash).toBe(482620)
    expect(report.closingCash).toBe(500220)
    expect(report.inflowGroups.map((group) => group.name)).toEqual(['未分类'])
    expect(report.outflowGroups.map((group) => group.name)).toEqual(['经营'])
    expect(report.inflowGross).toBe(50000)
    expect(report.outflowGross).toBe(32400)
    // 支出叶子必须真的生成：actual 已带符号，流出项不能因为再取反而被过滤掉。
    expect(report.outflowGroups[0].children.map((child) => child.label)).toEqual(['教育', '退款'])

    const sankey = deriveCashSankey(ledger, report, ALL_VISIBLE)
    expect(sankey.status).toBe('ready')
    expect(sankey.difference).toBe(0)
    expect(sankey.inflow).toBe(50000)
    expect(sankey.outflow).toBe(32400)
    for (const account of sankey.accounts) {
      expect(Math.abs(account.difference)).toBeLessThanOrEqual(1)
    }
  })

  it('API 模式隐藏分组：隐藏经营后支出侧落成「其他（已隐藏 1 组）」', () => {
    const ledger = cashConsistentLedger()
    const report = mapCashReport(CASH_FLOW, ledger, '2026-11-01', '2026-11-06')
    const settings = { ...ALL_VISIBLE, 经营: false }
    const sankey = deriveCashSankey(ledger, report, settings)
    expect(sankey.status).toBe('ready')
    expect(sankey.hiddenGroups).toBe(1)
    expect(sankey.nodes.some((node) => node.id === 'out:edu')).toBe(false)
    const hidden = sankey.nodes.find((node) => node.id === 'out:hidden')
    expect(hidden?.name).toBe('其他（已隐藏 1 组）')
  })

  it('桑基失败态：逐账户期初与后端不一致时说明差额并停画', () => {
    const ledger = ledgerWith([])
    const report = {
      ...mapCashReport(CASH_FLOW, ledger, '2026-10-01', '2026-10-31'),
      openingCash: 0,
    }
    const sankey = deriveCashSankey(ledger, report, ALL_VISIBLE)

    expect(sankey.status).toBe('invalid')
    const { container } = render(createElement(CashSankeyChart, { data: sankey, onOpen: () => {} }))
    expect(container.querySelector('.mb-rp-sankey-svg')).toBeNull()
    expect(sankey.reason).toContain('逐账户期初 / 期末合计与报表现金不一致')
  })

  it('投资分析：汇总 / 收益 / 分布 / 持仓取自后端；无投资账户时返回 null', () => {
    const data = {
      totalInvestment: 8645000,
      returnAnalysis: { cumulativeReturnRate: 12.5, xirr: 8.2, twr: 9.1 },
      byCategory: [{ categoryId: 'ac-invest', categoryName: '投资账户', balance: 8645000, ratio: 100 }],
      trend: [{ month: '2026-11', investment: 8645000 }],
      byAccountAllocation: [
        {
          accountId: 'brk',
          accountName: '长桥证券',
          balance: 8645000,
          returnRate: 12.5,
          items: [
            { assetClassId: 'stock', name: '股票', marketValue: 6000000, ratio: 0, targetRatio: 60, deviation: 0, rebalanceAmount: 0, periodInvested: 0, periodWithdrawn: 0, periodReturn: 600000, returnRate: 10, sort: 0 },
            { assetClassId: 'fund', name: '基金', marketValue: 2645000, ratio: 0, targetRatio: 40, deviation: 0, rebalanceAmount: 0, periodInvested: 0, periodWithdrawn: 0, periodReturn: 264500, returnRate: 10, sort: 1 },
          ],
        },
      ],
    } as never
    const report = mapInvestmentReport(data)
    expect(report).not.toBeNull()
    expect(report!.total).toBe(8645000)
    expect(report!.gainTotal).toBe(864500)
    expect(report!.costTotal).toBe(8645000 - 864500)
    expect(report!.holdings[0].marketValue).toBe(8645000)
    expect(report!.allocation.map((row) => row.name).sort()).toEqual(['基金', '股票'])
    // 占比分母按 Domain 口径取已分类市值之和，不再用 totalInvestment。
    expect(report!.allocation.find((row) => row.name === '股票')!.ratio).toBeCloseTo(69.4, 1)
    expect(mapInvestmentReport(null)).toBeNull()
  })

  it('投资分布含未分类项时，占比分母按 Domain 排除未分类', () => {
    const data = {
      totalInvestment: 1000000,
      returnAnalysis: { cumulativeReturnRate: 0, xirr: null, twr: null },
      byCategory: [],
      trend: [],
      byAccountAllocation: [
        {
          accountId: 'a', accountName: 'A', balance: 1000000, returnRate: 0,
          items: [
            { assetClassId: 'stock', name: '股票', marketValue: 600000, ratio: 60, targetRatio: 60, deviation: 0, rebalanceAmount: 0, periodInvested: 0, periodWithdrawn: 0, periodReturn: null, returnRate: null, sort: 0 },
            { assetClassId: '__unclassified__', name: '未分类', marketValue: 400000, ratio: 0, targetRatio: null, deviation: null, rebalanceAmount: null, periodInvested: 0, periodWithdrawn: 0, periodReturn: null, returnRate: null, sort: 999 },
          ],
        },
      ],
    } as never
    const report = mapInvestmentReport(data)!
    expect(report.allocation.find((row) => row.name === '股票')!.ratio).toBe(100)
    expect(report.allocation.find((row) => row.name === '未分类')!.ratio).toBe(0)
  })
})

describe('期间边界与锚点', () => {
  it('页面合计直接等于后端返回，不受本地流水过滤影响', () => {
    const ledger = ledgerWith([
      tx({ id: 'b1', date: '2026-11-01', amount: 100 }),
      tx({ id: 'b2', date: '2026-11-30', amount: 200 }),
    ])
    const report = mapFlowReport(INCOME_EXPENSE, [], ledger, '2026-11-01', '2026-11-30')
    expect(report.income).toBe(1850000)
    expect(report.expense).toBe(627760)
  })

  it('锚点跟真实今天 / 最新流水走，不再停在 2026-10-28', () => {
    expect(ledgerAnchorDay(ledgerWith([], '2026-11-06'))).toBe('2026-11-06')
    expect(
      ledgerAnchorDay(ledgerWith([tx({ id: 'f1', date: '2027-01-02' })], '2026-11-06')),
    ).toBe('2027-01-02')
    expect(ledgerAnchorDay(createSeedLedger())).toBe('2026-10-28')
  })
})

describe('桑基守恒（真数据适配）', () => {
  it('逐月差值都为 0（用同一后端口径构造 12 个月）', () => {
    const ledger = ledgerWith([
      tx({ id: 's1', date: '2026-11-02', amount: 50000, type: 'transfer', categoryId: 'move', accountId: 'cmb' }),
    ])
    const rows = []
    for (let month = 1; month <= 12; month += 1) {
      const from = `2026-${String(month).padStart(2, '0')}-01`
      const to = `2026-${String(month).padStart(2, '0')}-28`
      const report = mapCashReport(CASH_FLOW, ledger, from, to)
      const sankey = deriveCashSankey(ledger, report, ALL_VISIBLE)
      rows.push(assertCashSankeyConservation(sankey.opening, sankey.inflow, sankey.outflow, sankey.closing))
    }
    expect(rows).toEqual(new Array(12).fill(0))
  })

})

describe('展示口径固定，配置只剩数据范围', () => {
  it('现金流：桑基隐藏分组仍守恒（底层能力保留，UI 不再暴露开关）', () => {
    const ledger = cashConsistentLedger()
    const report = mapCashReport(CASH_FLOW, ledger, '2026-11-01', '2026-11-06')
    const sankey = deriveCashSankey(ledger, report, { 经营: false })
    expect(sankey.status).toBe('ready')
    expect(sankey.difference).toBe(0)
    expect(sankey.hiddenGroups).toBe(1)
    expect(sankey.nodes.some((node) => node.id === 'out:hidden')).toBe(true)
  })

  it('投资持仓沿用后端顺序（设置顺序），净值走势固定近 6 期', () => {
    const data = {
      totalInvestment: 300,
      returnAnalysis: { cumulativeReturnRate: 0, xirr: 0, twr: 0 },
      byCategory: [],
      trend: [],
      byAccountAllocation: [
        { accountId: 'a', accountName: 'A', balance: 100, returnRate: 20, items: [] },
        { accountId: 'b', accountName: 'B', balance: 200, returnRate: 1, items: [] },
      ],
    } as never
    const report = mapInvestmentReport(data)!
    expect(report.holdings.map((row) => row.id)).toEqual(['a', 'b'])
    expect(sliceSnapshots([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([3, 4, 5, 6, 7, 8])
  })

  it('本地配置只保存数据范围，旧版本四份视图配置被忽略', () => {
    expect(Object.keys(DEFAULT_REPORT_SETTINGS)).toEqual(['dataScope'])
    expect(
      normalizeReportSettings({
        balance: { groupMode: 'kind', showKindColumn: false },
        flow: { namedCategories: 5 },
        cash: { groups: { 经营: false } },
        invest: { sortBy: 'rate' },
      }),
    ).toEqual(DEFAULT_REPORT_SETTINGS)
  })
})

describe('无写调用', () => {
  it('报表目录全部源码只读，不引用任何写接口', () => {
    // 直接枚举目录而不是写死清单：新增 .ts/.tsx 自动纳入扫描，避免拆分后漏扫。
    const reportsDir = resolve(webSrc, 'features/reports')
    const entries = readdirSync(reportsDir, { withFileTypes: true })
    // 只枚举本层文件；一旦新增子目录就失败，避免子目录里的源码被静默漏扫。
    expect(entries.filter((entry) => entry.isDirectory())).toHaveLength(0)
    const files = entries
      .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
      .map((entry) => entry.name)
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const text = source(`features/reports/${name}`)
      expect(text, name).not.toMatch(/transactionApi\.(create|update|delete)/)
      expect(text, name).not.toMatch(/reportApi\.\w+Post|api\.post|api\.put|api\.delete/)
      expect(text, name).not.toContain('fetchAllTransactions')
    }
  })

  it('账本拉取改为完整期间分页，不再用 dashboard 的最近 8 笔', () => {
    const apiLedger = source('features/overview/apiLedger.ts')
    expect(apiLedger).toContain('fetchAllTransactions')
    expect(apiLedger).toContain('transactionApi.getAll')
    expect(apiLedger).toContain('payload.transactions.map')
    expect(apiLedger).not.toContain('payload.dashboard.recentTransactions.map')
  })
})
