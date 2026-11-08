/**
 * 报表未来时间轴（P2 / P4）
 *
 * 覆盖：三态判定、四粒度未来上限、按粒度换算的取数窗口、
 * 时间条统一未来（无视图级禁用），以及预测端点映射回既有视图模型的口径：
 * 三来源、planned=null、无预算标注、窗口级桑基直译。
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import type { AssetProjectionResult, CashFlowProjectionResult, IncomeExpenseProjectionResult } from '@/services/api'
import type { Ledger } from '@/features/overview/model'
import { makeLedger } from '../helpers/ledger'
import {
  mapProjectionBalanceReport,
  mapProjectionCashReport,
  mapProjectionFlowReport,
} from '@/features/reports/apiReports'
import { deriveCashSankey } from '@/features/reports/cashSankeyModel'
import { TimeBar } from '@/features/reports/TimeBar'
import {
  futureHorizon,
  futureRange,
  listBuckets,
  pointRangeState,
  rangeState,
  validateRange,
  type ReportTime,
} from '@/features/reports/reportsTime'
import { periodWindow, pointWindow } from '@/features/reports/futureModel'

const TODAY = '2026-11-06'

function renderWrapped(node: ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>)
}

function balanceOf(assets: number, liabilities: number) {
  return { assets, liabilities, netWorth: assets - liabilities }
}

function accountOf(
  accountId: string,
  name: string,
  type: 'asset' | 'liability',
  actual: number,
  committed: number,
  planned: number,
  extra: { categoryId?: string; categoryName?: string; isInvestment?: boolean } = {},
) {
  return {
    accountId,
    name,
    type,
    categoryId: extra.categoryId ?? '',
    categoryName: extra.categoryName ?? '',
    isInvestment: extra.isInvestment ?? false,
    actual,
    committed,
    planned,
    total: actual + committed + planned,
    hasFutureEvents: committed !== 0 || planned !== 0,
    valuationNote: extra.isInvestment ? ('transfer_schedule_only' as const) : null,
  }
}

function projectionFixture(): AssetProjectionResult {
  const actual = balanceOf(4_000_00, 100_00)
  const committed = balanceOf(0, 0)
  const planned = balanceOf(600_00, 0)
  return {
    asOf: TODAY,
    granularity: 'month',
    start: '2026-12-01',
    end: '2027-01-31',
    bucketCount: 2,
    base: actual,
    points: [
      {
        granularity: 'month',
        label: '2026-12',
        start: '2026-12-01',
        end: '2026-12-31',
        date: '2026-12-31',
        actual,
        planned,
        committed,
        total: balanceOf(4_600_00, 100_00),
        covered: [],
        accounts: [
          accountOf('a1', '现金', 'asset', 1_000_00, 0, 0, { categoryId: 'cat-cash' }),
          accountOf('a2', '投资', 'asset', 3_000_00, 0, 600_00, {
            categoryId: 'cat-inv',
            isInvestment: true,
          }),
          accountOf('a4', '闲置', 'asset', 0, 0, 0, { categoryId: 'cat-cash' }),
          accountOf('a3', '信用卡', 'liability', 100_00, 0, 0, { categoryId: 'cat-credit' }),
        ],
        categories: [],
      },
    ],
  }
}

function flowOf(actual: number, planned: number, committed: number) {
  return { actual, planned, committed, total: actual + planned + committed }
}

function incomeExpenseFixture(): IncomeExpenseProjectionResult {
  return {
    asOf: TODAY,
    granularity: 'month',
    start: '2026-12-01',
    end: '2027-01-31',
    bucketCount: 2,
    income: flowOf(200_00, 100_00, 80_00),
    expense: flowOf(0, 40_00, 80_00),
    balance: flowOf(200_00, 60_00, 0),
    incomeCategoryDetails: [
      {
        categoryId: 'cat-salary',
        name: '工资',
        hasChildren: false,
        sort: 0,
        actual: 200_00,
        committed: 80_00,
        planned: 100_00,
        total: 380_00,
        hasBudget: true,
      },
    ],
    expenseCategoryDetails: [
      {
        categoryId: 'cat-food',
        name: '餐饮',
        hasChildren: false,
        sort: 0,
        actual: 0,
        committed: 80_00,
        planned: null,
        total: 80_00,
        hasBudget: false,
      },
      {
        categoryId: 'cat-rent',
        name: '房租',
        hasChildren: false,
        sort: 1,
        actual: 0,
        committed: 0,
        planned: 40_00,
        total: 40_00,
        hasBudget: true,
      },
    ],
    points: [
      {
        granularity: 'month',
        label: '2026-12',
        start: '2026-12-01',
        end: '2026-12-31',
        date: '2026-12-31',
        income: flowOf(200_00, 100_00, 80_00),
        expense: flowOf(0, 40_00, 80_00),
        balance: flowOf(200_00, 60_00, 0),
        covered: [],
      },
    ],
    predictionNote: '含预算预测数据',
  }
}

function cashActivityFixture() {
  const item = (
    categoryId: string,
    categoryName: string,
    type: string,
    direction: string,
    actual: number,
    committed: number,
    planned: number | null,
  ) => ({
    categoryId,
    categoryName,
    parentId: null,
    level: 1,
    type,
    direction,
    actual,
    committed,
    planned,
    total: actual + committed + (planned ?? 0),
  })
  return {
    operating: {
      inflow: flowOf(200_00, 100_00, 80_00),
      outflow: flowOf(0, 40_00, 80_00),
      net: flowOf(200_00, 60_00, 0),
      items: [
        item('cat-salary', '工资', 'income', 'in', 200_00, 80_00, 100_00),
        item('cat-rent', '房租', 'expense', 'out', 0, -80_00, -40_00),
      ],
    },
    investing: {
      inflow: flowOf(0, 0, 0),
      outflow: flowOf(0, 0, 80_00),
      net: flowOf(0, 0, -80_00),
      items: [item('cat-buy', '证券买入', 'transfer', 'out', 0, 0, -80_00)],
    },
    financing: {
      inflow: flowOf(0, 0, 0),
      outflow: flowOf(0, 0, 0),
      net: flowOf(0, 0, 0),
      items: [],
    },
    uncategorized: {
      inflow: flowOf(0, 0, 0),
      outflow: flowOf(0, 0, 0),
      net: flowOf(0, 0, 0),
      items: [],
    },
  }
}

function cashFixture(): CashFlowProjectionResult {
  return {
    asOf: TODAY,
    granularity: 'month',
    start: '2026-12-01',
    end: '2027-01-31',
    bucketCount: 2,
    startCash: 5_000_00,
    endCash: 5_180_00,
    cashInflow: flowOf(200_00, 100_00, 80_00),
    cashOutflow: flowOf(0, 40_00, 160_00),
    netCashFlow: flowOf(200_00, 60_00, -80_00),
    byActivity: cashActivityFixture(),
    sankey: {
      nodes: [
        { name: '工资', category: 'income_category' as const },
        { name: '现金', category: 'cash' as const },
        { name: '房租', category: 'expense_category' as const },
        { name: '证券买入', category: 'non_cash_target' as const },
      ],
      links: [
        { source: '工资', target: '现金', value: 380_00 },
        { source: '现金', target: '房租', value: 120_00 },
        { source: '现金', target: '证券买入', value: 80_00 },
      ],
    },
    covered: [],
    predictionNote: '含预算预测数据',
    points: [
      {
        granularity: 'month',
        label: '2026-12',
        start: '2026-12-01',
        end: '2026-12-31',
        date: '2026-12-31',
        inflow: flowOf(200_00, 100_00, 80_00),
        outflow: flowOf(0, 40_00, 160_00),
        net: flowOf(200_00, 60_00, -80_00),
        startCash: 5_000_00,
        endCash: 5_180_00,
        covered: [],
      },
    ],
  }
}

function ledgerFixture(): Ledger {
  return makeLedger({
    accounts: [
      { id: 'a1', name: '现金', kind: 'cash', balance: 1_000_00, categoryId: 'cat-cash' },
      { id: 'a2', name: '投资', kind: 'investment', balance: 3_000_00, categoryId: 'cat-inv' },
      { id: 'a3', name: '信用卡', kind: 'credit', balance: -100_00, categoryId: 'cat-credit' },
    ],
  })
}

describe('未来时间轴：三态与上限', () => {
  it('已发生 / 混合 / 全未来按今天判定', () => {
    expect(rangeState('2026-10-01', '2026-11-06', TODAY)).toBe('past')
    expect(rangeState('2026-11-01', '2026-11-30', TODAY)).toBe('mixed')
    expect(rangeState('2026-12-01', '2027-01-31', TODAY)).toBe('future')
    expect(pointRangeState('2026-11-30', TODAY, 'month')).toBe('mixed')
    expect(pointRangeState('2026-12-31', TODAY, 'month')).toBe('future')
  })

  it('四粒度未来上限按后端规则：日 3 月 / 周 6 月 / 月 12 月 / 年 3 年', () => {
    expect(futureHorizon(TODAY, 'day')).toBe('2027-02-06')
    expect(futureHorizon(TODAY, 'week')).toBe('2027-05-06')
    expect(futureHorizon(TODAY, 'month')).toBe('2027-11-30')
    expect(futureHorizon(TODAY, 'year')).toBe('2029-12-31')
    expect(futureRange(TODAY, 3)).toEqual({ from: '2026-12-01', to: '2027-02-28' })
    expect(futureRange(TODAY, 12)).toEqual({ from: '2026-12-01', to: '2027-11-30' })
  })

  it('四种粒度都允许未来，各自按上限校验', () => {
    expect(validateRange('2026-11-07', '2027-02-06', 'day', TODAY).ok).toBe(true)
    expect(validateRange('2026-11-07', '2027-02-07', 'day', TODAY).ok).toBe(false)
    expect(validateRange('2026-11-09', '2027-05-06', 'week', TODAY).ok).toBe(true)
    expect(validateRange('2026-11-09', '2027-05-08', 'week', TODAY).ok).toBe(false)
    expect(validateRange('2026-12-01', '2027-01-31', 'month', TODAY).ok).toBe(true)
    expect(validateRange('2026-12-01', '2027-12-31', 'month', TODAY).ok).toBe(false)
    expect(validateRange('2027-01-01', '2029-12-31', 'year', TODAY).ok).toBe(true)
    expect(validateRange('2027-01-01', '2030-01-01', 'year', TODAY).ok).toBe(false)
  })

  it('周桶按 ISO 周一切分并输出 YYYY-Www 标签', () => {
    expect(listBuckets('2026-11-06', '2026-11-20', 'week')).toEqual([
      { key: '2026-11-02', label: '2026-W45', from: '2026-11-02', to: '2026-11-08' },
      { key: '2026-11-09', label: '2026-W46', from: '2026-11-09', to: '2026-11-15' },
      { key: '2026-11-16', label: '2026-W47', from: '2026-11-16', to: '2026-11-22' },
    ])
  })
})

describe('未来窗口换算：按当前粒度', () => {
  it('资产负债时点从今天所在桶起算，止于所选桶末', () => {
    expect(pointWindow('2026-11-30', TODAY, 'month')).toEqual({
      asOf: TODAY,
      granularity: 'month',
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(pointWindow('2026-12-31', TODAY, 'month')).toEqual({
      asOf: TODAY,
      granularity: 'month',
      from: '2026-11-01',
      to: '2026-12-31',
    })
    expect(pointWindow('2026-11-07', TODAY, 'day')).toEqual({
      asOf: TODAY,
      granularity: 'day',
      from: '2026-11-06',
      to: '2026-11-07',
    })
    expect(pointWindow('2026-11-08', TODAY, 'week')).toEqual({
      asOf: TODAY,
      granularity: 'week',
      from: '2026-11-02',
      to: '2026-11-08',
    })
    expect(pointWindow('2029-12-31', TODAY, 'year')).toEqual({
      asOf: TODAY,
      granularity: 'year',
      from: '2026-01-01',
      to: '2029-12-31',
    })
  })

  it('期间窗口保留用户 from，止对齐到当前粒度桶末', () => {
    expect(periodWindow('2026-11-01', '2027-01-31', TODAY, 'month')).toEqual({
      asOf: TODAY,
      granularity: 'month',
      from: '2026-11-01',
      to: '2027-01-31',
    })
    expect(periodWindow('2026-12-01', '2027-03-31', TODAY, 'month')).toEqual({
      asOf: TODAY,
      granularity: 'month',
      from: '2026-12-01',
      to: '2027-03-31',
    })
    expect(periodWindow('2026-11-02', '2026-11-15', TODAY, 'week')).toEqual({
      asOf: TODAY,
      granularity: 'week',
      from: '2026-11-02',
      to: '2026-11-15',
    })
    expect(periodWindow('2026-11-06', '2026-11-20', TODAY, 'day')).toEqual({
      asOf: TODAY,
      granularity: 'day',
      from: '2026-11-06',
      to: '2026-11-20',
    })
  })
})

describe('时间条：未来统一、无视图级禁用', () => {
  const futureTime: ReportTime = {
    gran: 'month',
    point: '2026-12-31',
    from: '2026-12-01',
    to: '2026-12-31',
    preset: 'nextMonth',
  }

  it('月粒度未来区间显示「全未来」状态', () => {
    renderWrapped(
      <TimeBar
        device="desktop"
        tab="balance"
        time={futureTime}
        today={TODAY}
        onChange={() => undefined}
        onToast={() => undefined}
        onOpenSettings={() => undefined}
      />,
    )
    expect(screen.getByText('全未来')).toBeTruthy()
    expect(screen.getByText('周')).toBeTruthy()
  })

  it('三态标记对所有视图常驻，不再按视图隐藏', () => {
    renderWrapped(
      <TimeBar
        device="desktop"
        tab="invest"
        time={futureTime}
        today={TODAY}
        onChange={() => undefined}
        onToast={() => undefined}
        onOpenSettings={() => undefined}
      />,
    )
    expect(screen.getByText('全未来')).toBeTruthy()
  })
})

describe('资产负债预测映射：账户明细与三来源', () => {
  it('账户行来自账户层，负债正数，0 元账户只计入提示', () => {
    const report = mapProjectionBalanceReport(projectionFixture(), ledgerFixture())
    expect(report.assets.map((row) => [row.name, row.amount])).toEqual([
      ['投资', 3_600_00],
      ['现金', 1_000_00],
    ])
    expect(report.liabilities.map((row) => [row.name, row.amount])).toEqual([['信用卡', 100_00]])
    expect(report.zeroAccountCount).toBe(1)
    expect(report.assetTotal).toBe(4_600_00)
    expect(report.netWorth).toBe(4_500_00)
    expect(report.trend.map((point) => point.month)).toEqual(['2026-12'])
    expect(report.predictionNote).toContain('投资账户只按买卖')
  })

  it('指标行按三来源拆开，不用 0 冒充预算来源', () => {
    const report = mapProjectionBalanceReport(projectionFixture(), ledgerFixture())
    const assetMetric = report.metrics.find((metric) => metric.label === '总资产')
    expect(assetMetric?.prediction?.split).toContain('已发生')
    expect(assetMetric?.prediction?.split).toContain('按预算计划')
    expect(assetMetric?.prediction?.split).toContain('已排定')
    expect(assetMetric?.prediction?.split).toContain('合计')
  })
})

describe('收支预测映射：分类明细与无预算标注', () => {
  it('分类金额取 total，预测部分 = total − actual', () => {
    const report = mapProjectionFlowReport(
      incomeExpenseFixture(),
      ledgerFixture(),
      '2026-12-01',
      '2027-01-31',
    )
    expect(report.income).toBe(380_00)
    expect(report.expense).toBe(120_00)
    expect(report.balance).toBe(260_00)
    expect(report.incomeTrees[0].amount).toBe(380_00)
    expect(report.incomeTrees[0].predicted).toBe(180_00)
    expect(report.incomeTrees[0].noBudget).toBeUndefined()
  })

  it('planned=null 的分类标「无预算」，笔数沿用真实流水口径', () => {
    const report = mapProjectionFlowReport(
      incomeExpenseFixture(),
      ledgerFixture(),
      '2026-12-01',
      '2027-01-31',
    )
    const food = report.expenseTrees.find((node) => node.name === '餐饮')
    expect(food?.noBudget).toBe(true)
    expect(food?.predicted).toBe(80_00)
    expect(food?.count).toBe(0)
    expect(report.predictionNote).toBe('含预算预测数据')
  })

  it('逐桶走势按桶内发生额输出，不累计', () => {
    const report = mapProjectionFlowReport(
      incomeExpenseFixture(),
      ledgerFixture(),
      '2026-12-01',
      '2027-01-31',
    )
    expect(report.series).toEqual([{ label: '2026-12', income: 380_00, expense: 120_00 }])
  })
})

describe('现金流预测映射：活动分组、三来源与桑基直译', () => {
  it('活动分组按方向拆分，第二列说明分类数而非笔数', () => {
    const report = mapProjectionCashReport(cashFixture(), '2026-12-01', '2027-01-31')
    expect(report.inflowGroups.map((group) => [group.name, group.total])).toEqual([['经营', 380_00]])
    expect(report.outflowGroups.map((group) => [group.name, group.total])).toEqual([
      ['经营', 120_00],
      ['投资', 80_00],
    ])
    expect(report.inflowGroups[0].meta).toBe('1 个分类')
    expect(report.outflowGroups[1].meta).toBe('1 个分类')
    expect(report.operatingNet).toBe(260_00)
    expect(report.investingNet).toBe(-80_00)
    expect(report.closingCash).toBe(5_180_00)
    expect(report.predictionNote).toBe('含预算预测数据')
  })

  it('窗口级桑基直接消费后端 link，不再用账本回放校验', () => {
    const report = mapProjectionCashReport(cashFixture(), '2026-12-01', '2027-01-31')
    const sankey = deriveCashSankey(ledgerFixture(), report, {})
    expect(sankey.status).toBe('ready')
    expect(sankey.opening).toBe(5_000_00)
    expect(sankey.closing).toBe(5_180_00)
    expect(sankey.inflow).toBe(380_00)
    expect(sankey.outflow).toBe(200_00)
    expect(sankey.difference).toBe(0)
    // 现金 → 非现金目标属于流出，不是账户间转账；transferTotal 只统计现金账户之间。
    expect(sankey.transferTotal).toBe(0)
    expect(sankey.nodes).toHaveLength(4)
    expect(sankey.links.map((link) => [link.sourceId, link.targetId])).toEqual([
      ['in:工资', 'acct:现金'],
      ['acct:现金', 'out:房租'],
      ['acct:现金', 'out:证券买入'],
    ])
    expect(sankey.links[2].kind).toBe('flow')
  })
})
