/**
 * 收支分类构成回归：真实库存在单笔历史负向支出（钱包 / 餐饮 ¥28.00），
 * 接口 detail.actual = -2800。分类构成必须按绝对值入树，并且笔数与后端真实分类 id
 * 映射回账本展示 id 后能对上，不能出现「合计有金额、构成没有数据」或 0 笔。
 */
import { describe, expect, it } from 'vitest'
import type { IncomeExpenseReportData, ReportValue } from '@contracts/types'
import { mapCashReport, mapFlowReport } from '@/features/reports/apiReports'
import { buildDrillFor, flowDrillTarget, type FlowTreeNode } from '@/features/reports/reportsModel'
import type { Ledger } from '@/features/overview/model'

function value(actual: number): ReportValue {
  return { actual, predicted: 0 }
}

const ledger: Ledger = {
  accounts: [{ id: 'wallet', name: '钱包', kind: 'cash', balance: 2_800 }],
  categories: [{ id: 'food', name: '餐饮', type: 'expense' }],
  budgets: [],
  transactions: [
    {
      id: 'tx-food',
      date: '2026-11-04',
      type: 'expense',
      categoryId: 'food',
      note: '生产冷启动',
      accountId: 'wallet',
      amount: -2_800,
    },
  ],
  // 接口分类返回后端真实 id，账本流水按展示 id 归集（真实库同名分类会被改写成种子 key）。
  ids: { categoryDisplay: { 'real-food': 'food' }, categoryReal: { food: 'real-food' } },
}

const reportData: IncomeExpenseReportData = {
  startDate: '2026-11-01',
  endDate: '2026-11-06',
  income: value(0),
  expense: value(-2_800),
  balance: value(2_800),
  reconciliation: {
    startNetWorth: 0,
    netIncome: 0,
    netExpense: -2_800,
    other: 0,
    endNetWorth: 2_800,
    difference: 0,
  },
  incomeByCategory: {},
  expenseByCategory: { 'real-food': -2_800 },
  incomeCategoryDetails: [],
  expenseCategoryDetails: [
    {
      name: '餐饮',
      actual: -2_800,
      predicted: 0,
      categoryId: 'real-food',
      hasChildren: false,
      sort: 0,
    },
  ],
}

describe('mapFlowReport 分类构成', () => {
  it('负向支出的分类仍进入构成，金额与合计同口径', () => {
    const report = mapFlowReport(
      reportData,
      [{ label: '2026-11', income: 0, expense: -2_800 }],
      ledger,
      '2026-11-01',
      '2026-11-06',
    )

    expect(report.expenseTrees).toHaveLength(1)
    expect(report.expenseTrees[0]).toMatchObject({
      // 行 id 与笔数、下钻同用展示 id；真实库同名根分类会被改写成种子 key。
      id: 'food',
      name: '餐饮',
      amount: 2_800,
      count: 1,
      share: 100,
    })
  })

  it('笔数沿父链上卷：父级含子级，子级只算自身', () => {
    const treeLedger: Ledger = {
      ...ledger,
      categories: [
        { id: 'food', name: '餐饮', type: 'expense' },
        { id: 'meal', name: '三餐', type: 'expense', parentId: 'food' },
      ],
      transactions: [{ ...ledger.transactions[0], categoryId: 'meal' }],
    }
    const treeData: IncomeExpenseReportData = {
      ...reportData,
      expenseCategoryDetails: [
        {
          name: '餐饮',
          actual: -2_800,
          predicted: 0,
          categoryId: 'real-food',
          hasChildren: true,
          sort: 0,
          children: [
            { name: '三餐', actual: -2_800, predicted: 0, categoryId: 'meal', hasChildren: false, sort: 0 },
          ],
        },
      ],
    }
    const report = mapFlowReport(treeData, [], treeLedger, '2026-11-01', '2026-11-06')

    expect(report.expenseTrees[0].count).toBe(1)
    expect(report.expenseTrees[0].children[0].count).toBe(1)
  })

  it('根分类行 id 与下钻同一 id 空间，逐笔加总等于行金额', () => {
    const report = mapFlowReport(reportData, [], ledger, '2026-11-01', '2026-11-06')
    const row = report.expenseTrees[0]
    const drill = buildDrillFor(ledger, flowDrillTarget(row, 'expense'), '2026-11-01', '2026-11-06')

    expect(drill.transactions).toHaveLength(1)
    expect(
      Math.abs(drill.transactions.reduce((sum, transaction) => sum + transaction.amount, 0)),
    ).toBe(row.amount)
  })
})

describe('buildDrill 与「不计收支」开关同口径', () => {
  const from = '2026-11-01'
  const to = '2026-11-06'
  const withExcluded: Ledger = {
    ...ledger,
    transactions: [
      ...ledger.transactions,
      {
        id: 'tx-excluded',
        date: '2026-11-05',
        type: 'expense',
        categoryId: 'food',
        note: '不计收支',
        accountId: 'wallet',
        amount: -500,
        excludeFromIncomeExpense: true,
      },
    ],
  }
  const node: FlowTreeNode = {
    id: 'food',
    name: '餐饮',
    amount: 2_800,
    count: 1,
    share: 100,
    level: 0,
    children: [],
  }

  it('开关关闭：不计收支流水不进下钻，逐笔合计等于行金额', () => {
    const drill = buildDrillFor(withExcluded, flowDrillTarget(node, 'expense'), from, to)
    expect(drill.transactions).toHaveLength(1)
    expect(Math.abs(drill.transactions.reduce((sum, transaction) => sum + transaction.amount, 0))).toBe(
      2_800,
    )
  })

  it('开关打开：不计收支流水计入下钻，逐笔合计等于行金额', () => {
    const drill = buildDrillFor(withExcluded, flowDrillTarget(node, 'expense'), from, to, true)
    expect(drill.transactions).toHaveLength(2)
    expect(Math.abs(drill.transactions.reduce((sum, transaction) => sum + transaction.amount, 0))).toBe(
      3_300,
    )
  })
})

describe('mapFlowReport 计入不计收支', () => {
  it('口径开关同时改变分类笔数，且树金额改用同一口径的合计做占比', () => {
    const withExcluded: Ledger = {
      ...ledger,
      transactions: [
        ...ledger.transactions,
        {
          id: 'tx-excluded',
          date: '2026-11-05',
          type: 'expense',
          categoryId: 'food',
          note: '不计收支',
          accountId: 'wallet',
          amount: 500,
          excludeFromIncomeExpense: true,
        },
      ],
    }
    const excludes = mapFlowReport(reportData, [], withExcluded, '2026-11-01', '2026-11-06')
    const includes = mapFlowReport(reportData, [], withExcluded, '2026-11-01', '2026-11-06', true)

    expect(excludes.includeExcluded).toBe(false)
    expect(includes.includeExcluded).toBe(true)
    expect(excludes.expenseTrees[0].count).toBe(1)
    expect(includes.expenseTrees[0].count).toBe(2)
  })
})

describe('mapFlowReport 预测口径', () => {
  it('合计 = 实际 + 预测，指标带「预测」拆解，实际为 0 时也能区分两类数字', () => {
    const predictedData: IncomeExpenseReportData = {
      ...reportData,
      income: { actual: 5_000, predicted: 2_000 },
      expense: { actual: -2_800, predicted: -1_200 },
      balance: { actual: 2_200, predicted: 800 },
      predictionNote: '含预算预测数据',
    }
    const report = mapFlowReport(predictedData, [], ledger, '2026-11-01', '2026-11-30')

    expect(report.income).toBe(7_000)
    expect(report.expense).toBe(4_000)
    expect(report.balance).toBe(3_000)
    expect(report.predictionNote).toBe('含预算预测数据')
    expect(report.metrics.map((metric) => Boolean(metric.prediction))).toEqual([true, true, true, false])
    expect(report.metrics[1].prediction?.split).toContain('实际 +¥50.00')
    expect(report.metrics[1].prediction?.split).toContain('预测 +¥20.00')
    expect(report.metrics[2].prediction?.split).toContain('预测 −¥12.00')
  })

  it('预测为 0 时不加标签、不出现拆解行', () => {
    const report = mapFlowReport(reportData, [], ledger, '2026-11-01', '2026-11-06')
    expect(report.metrics.map((metric) => Boolean(metric.prediction))).toEqual([false, false, false, false])
  })
})

describe('mapCashReport 现金流下钻 id 空间', () => {
  const emptyActivity = () => ({ inflow: value(0), outflow: value(0), net: value(0), items: [] })
  const cashData = {
    startDate: '2026-11-01',
    endDate: '2026-11-06',
    cashInflow: value(0),
    cashOutflow: value(-2_800),
    netCashFlow: value(-2_800),
    reconciliation: value(0),
    flowByAccount: {},
    startCash: value(2_800),
    endCash: value(0),
    cashChange: value(-2_800),
    byActivity: {
      operating: {
        ...emptyActivity(),
        outflow: value(-2_800),
        net: value(-2_800),
        items: [
          {
            categoryName: '餐饮',
            categoryId: 'real-food',
            parentId: null,
            level: 0,
            amount: -2_800,
            actual: -2_800,
            predicted: 0,
            type: 'expense',
            direction: 'outflow',
          },
        ],
      },
      investing: emptyActivity(),
      financing: emptyActivity(),
      uncategorized: emptyActivity(),
    },
    sankey: { nodes: [], links: [] },
  }

  it('接口真实分类 id 翻成展示 id 后，账户列与下钻都能命中流水', () => {
    const report = mapCashReport(cashData, ledger, '2026-11-01', '2026-11-06')
    const child = report.outflowGroups.flatMap((group) => group.children).find((row) => row.label === '餐饮')
    expect(child?.categoryId).toBe('food')
    expect(child?.account).toBe('钱包')
    const drill = buildDrillFor(
      ledger,
      {
        type: 'category',
        title: '餐饮',
        amount: child?.amount ?? 0,
        childTitle: '分类',
        children: [],
        ids: [child?.categoryId ?? ''],
        side: 'expense',
      },
      '2026-11-01',
      '2026-11-06',
    )
    expect(drill.transactions.map((transaction) => transaction.id)).toEqual(['tx-food'])
  })
})
