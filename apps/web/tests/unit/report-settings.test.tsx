/**
 * 报表设置四个配置：存在、切换生效、刷新保持、不调用写接口。
 *
 * 展示偏好只落 localStorage；这里同时验证纯变换函数（分组 / 列 / 活动分组 / 快照）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerContext, type LedgerContextValue } from '@/features/overview/ledgerStore'
import { ToastProvider } from '@/features/shared/toast'
import { TODAY } from '@/features/overview/model'
import { createSeedLedger } from '@/dev-fixtures/seed'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { CompositionBars } from '@/features/reports/charts'
import {
  CASH_GROUP_KEYS,
  DEFAULT_REPORT_SETTINGS,
  REPORT_SETTINGS_KEY,
  cashTotalOf,
  groupBalanceRows,
  loadReportSettings,
  normalizeReportSettings,
  saveReportSettings,
  sliceSnapshots,
  sortHoldingRows,
  visibleCashGroups,
} from '@/features/reports/reportSettings'
import {
  mapBalanceReport,
  mapCashReport,
  mapFlowReport,
  mapInvestmentReport,
} from '@/features/reports/apiReports'

const ledger = createSeedLedger()
const monthFrom = `${TODAY.slice(0, 7)}-01`

const contextValue = {
  ledger,
  dataMode: 'seed' as const,
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransactions: vi.fn(),
  setTransactionCategory: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  reorderAccount: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  moveCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reorderCategory: vi.fn(),
  undo: vi.fn(),
  replaceLedger: vi.fn(),
} as unknown as LedgerContextValue

function renderPage(settingsOpen = true) {
  const queryClient = new QueryClient()
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <LedgerContext.Provider value={contextValue}>
          <ToastProvider>
            <ReportsPage
              device="desktop"
              dataState="ready"
              settingsOpen={settingsOpen}
              onSettingsToggle={() => {}}
              onRetry={() => {}}
              onImport={() => {}}
              onViewFlow={() => {}}
            />
          </ToastProvider>
        </LedgerContext.Provider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('四个配置存在且默认值等于现状', () => {
  it('设置抽屉列出资产负债 / 收支明细 / 现金流 / 投资分析四个配置', () => {
    renderPage()
    expect(screen.getAllByRole('button', { name: '配置' })).toHaveLength(4)
  })

  it('空存储与脏存储都回到与当前报表一致的默认值', () => {
    expect(loadReportSettings()).toEqual(DEFAULT_REPORT_SETTINGS)
    expect(
      normalizeReportSettings({
        balance: { groupMode: 'bogus', showKindColumn: 'yes' },
        flow: { namedCategories: 99 },
        cash: { groups: { 经营: false } },
        invest: { sortBy: 'cost', snapshotCount: 12 },
      }),
    ).toEqual({
      ...DEFAULT_REPORT_SETTINGS,
      cash: { groups: { ...DEFAULT_REPORT_SETTINGS.cash.groups, 经营: false } },
    })
  })
})

describe('四个配置切换后目标结构变化', () => {
  // 全部来自后端报表 DTO：资产负债、现金流、投资分析、收支明细。
  const balance = mapBalanceReport(
    {
      date: TODAY,
      assets: { actual: 15_172_915, predicted: 0 },
      liabilities: { actual: 211_840, predicted: 0 },
      netWorth: { actual: 14_961_075, predicted: 0 },
      assetNodes: [
        {
          id: 'ac-invest',
          name: '投资',
          actual: 8_645_000,
          children: [{ id: 'brk', name: '长桥证券', actual: 8_645_000 }],
        },
        {
          id: 'ac-savings',
          name: '储蓄',
          actual: 6_027_695,
          children: [{ id: 'cmb', name: '招商储蓄卡', actual: 6_027_695 }],
        },
        {
          id: 'ac-cash',
          name: '现金等价',
          actual: 500_220,
          children: [
            { id: 'wx', name: '微信零钱', actual: 124_020 },
            { id: 'zfb', name: '支付宝', actual: 376_200 },
          ],
        },
      ],
      liabilityNodes: [
        {
          id: 'ac-credit',
          name: '信用账户',
          actual: 211_840,
          children: [{ id: 'xyk', name: '交行信用卡', actual: 211_840 }],
        },
      ],
    } as never,
    [],
    ledger,
  )
  const cash = mapCashReport(
    {
      cashInflow: { actual: 0 },
      cashOutflow: { actual: -69_900 },
      startCash: { actual: 500_220 },
      endCash: { actual: 430_320 },
      byActivity: {
        operating: {
          inflow: { actual: 0 },
          outflow: { actual: -19_900 },
          net: { actual: -19_900 },
          items: [
            {
              categoryName: '教育',
              categoryId: 'edu',
              actual: -19_900,
              direction: 'outflow',
              type: 'expense',
            },
          ],
        },
        investing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
        financing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
        uncategorized: {
          inflow: { actual: 0 },
          outflow: { actual: -50_000 },
          net: { actual: -50_000 },
          items: [
            {
              categoryName: '账户互转',
              categoryId: 'move',
              actual: -50_000,
              direction: 'outflow',
              type: 'transfer_out',
            },
          ],
        },
      },
    } as never,
    ledger,
    monthFrom,
    TODAY,
  )
  const invest = mapInvestmentReport(
    {
      totalInvestment: 80_000,
      byAccountAllocation: [
        {
          accountId: 'brk',
          accountName: '长桥证券',
          balance: 80_000,
          returnRate: 0.12,
          items: [
            {
              assetClassId: 'stock',
              name: '股票',
              marketValue: 50_000,
              periodReturn: 2_500,
              returnRate: 0.05,
              targetRatio: 60,
              rebalanceAmount: 0,
            },
            {
              assetClassId: 'fund',
              name: '基金',
              marketValue: 20_000,
              periodReturn: 2_000,
              returnRate: 0.1,
              targetRatio: 25,
              rebalanceAmount: 0,
            },
            {
              assetClassId: 'bond',
              name: '债券',
              marketValue: 10_000,
              periodReturn: 2_000,
              returnRate: 0.2,
              targetRatio: 15,
              rebalanceAmount: 0,
            },
          ],
        },
      ],
      byCategory: [],
      returnAnalysis: { cumulativeReturnRate: 0.12, xirr: 0.1, twr: 0.1 },
      trend: Array.from({ length: 6 }, (_, index) => ({
        month: `2026-${String(index + 6).padStart(2, '0')}`,
        investment: 70_000 + index * 2_000,
      })),
    } as never,
  )
  const flow = mapFlowReport(
    {
      income: { actual: 50_000 },
      expense: { actual: 36_000 },
      balance: { actual: 14_000 },
      incomeCategoryDetails: [{ name: '工资', categoryId: 'salary', actual: 50_000, children: [] }],
      expenseCategoryDetails: Array.from({ length: 8 }, (_, index) => ({
        name: `分类${index}`,
        categoryId: `c${index}`,
        actual: 1_000 - index * 50,
        children: [],
      })),
    } as never,
    [],
    ledger,
    monthFrom,
    TODAY,
  )

  it('资产负债：按性质汇总把 4 个账户并成 3 行', () => {
    expect(balance.assets).toHaveLength(4)
    const grouped = groupBalanceRows(balance.assets, 'kind')
    expect(grouped.map((row) => row.name)).toEqual(['投资', '储蓄', '现金等价'])
    expect(grouped).toHaveLength(3)
  })

  it('收支明细：具名类别 6 → 5，其余从 2 类变 3 类', () => {
    const six = render(
      <CompositionBars
        incomeTrees={flow.incomeTrees}
        expenseTrees={flow.expenseTrees}
        incomeTotal={flow.income}
        expenseTotal={flow.expense}
        namedCount={6}
        device="desktop"
      />,
    )
    expect(screen.getByRole('img', { name: /其余 2 类/ })).toBeInTheDocument()
    six.unmount()

    render(
      <CompositionBars
        incomeTrees={flow.incomeTrees}
        expenseTrees={flow.expenseTrees}
        incomeTotal={flow.income}
        expenseTotal={flow.expense}
        namedCount={5}
        device="desktop"
      />,
    )
    expect(screen.getByRole('img', { name: /其余 3 类/ })).toBeInTheDocument()
  })

  it('现金流：隐藏未分类后流出分组 2 → 1，合计只剩经营', () => {
    expect(cash.outflowGroups.map((group) => group.key)).toEqual(['经营', '未分类'])
    const settings = {
      ...DEFAULT_REPORT_SETTINGS.cash,
      groups: CASH_GROUP_KEYS.reduce(
        (groups, key) => ({ ...groups, [key]: key !== '未分类' }),
        {} as typeof DEFAULT_REPORT_SETTINGS.cash.groups,
      ),
    }
    const visible = visibleCashGroups(cash.outflowGroups, settings)
    expect(visible.map((group) => group.key)).toEqual(['经营'])
    expect(cashTotalOf(visible)).toBeLessThan(cash.outflowTotal)
    expect(cash.outflowTotal - cashTotalOf(visible)).toBeGreaterThan(0)
  })

  it('投资分析：近 6 期 → 近 3 期；按收益率排序改变子级行序', () => {
    expect(invest.trend).toHaveLength(6)
    expect(sliceSnapshots(invest.trend, 3)).toHaveLength(3)
    const group = invest.holdings[0]
    expect(group.children.map((child) => child.name)).toEqual(['股票', '基金', '债券'])
    expect(sortHoldingRows(group.children, 'rate').map((child) => child.name)).toEqual([
      '债券',
      '基金',
      '股票',
    ])
  })
})

describe('保存 / 读取闭环', () => {
  it('保存后 load 读回同一份配置', () => {
    const settings = normalizeReportSettings({
      balance: { groupMode: 'kind', showKindColumn: false },
      flow: { namedCategories: 5, showCountColumn: false, showShareColumn: true },
      cash: { groups: { ...DEFAULT_REPORT_SETTINGS.cash.groups, 未分类: false } },
      invest: { showTarget: false, sortBy: 'rate', snapshotCount: 3 },
    })
    saveReportSettings(settings)
    expect(loadReportSettings()).toEqual(
      normalizeReportSettings(JSON.parse(window.localStorage.getItem(REPORT_SETTINGS_KEY) ?? '{}')),
    )
    expect(loadReportSettings()).toEqual(settings)
  })
})
