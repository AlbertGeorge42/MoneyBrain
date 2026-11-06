/**
 * 报表设置四个配置：存在、切换生效、刷新保持、不调用写接口。
 *
 * 展示偏好只落 localStorage；这里同时验证纯变换函数（分组 / 列 / 活动分组 / 快照）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerContext, type LedgerContextValue } from '@/features/overview/ledgerStore'
import { TODAY, createSeedLedger } from '@/features/overview/model'
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
  deriveBalanceReport,
  deriveCashReport,
  deriveInvestmentReport,
  deriveFlowReport,
} from '@/features/reports/reportsModel'

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
          <ReportsPage
          device="desktop"
          dataState="ready"
          settingsOpen={settingsOpen}
          onSettingsToggle={() => {}}
          onRetry={() => {}}
          onImport={() => {}}
            onViewFlow={() => {}}
          />
        </LedgerContext.Provider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

function assetRowCount() {
  const table = screen.getByLabelText('资产明细')
  return table.querySelectorAll('tbody tr').length
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
  const balance = deriveBalanceReport(ledger, TODAY)
  const cash = deriveCashReport(ledger, monthFrom, TODAY)
  const invest = deriveInvestmentReport(ledger)
  const flow = deriveFlowReport(ledger, monthFrom, TODAY, 'month')

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

  it('现金流：隐藏账户间转账后流出分组 2 → 1，合计只剩经营', () => {
    expect(cash.outflowGroups.map((group) => group.key)).toEqual(['经营', '账户间转账'])
    const settings = {
      ...DEFAULT_REPORT_SETTINGS.cash,
      groups: CASH_GROUP_KEYS.reduce(
        (groups, key) => ({ ...groups, [key]: key !== '账户间转账' }),
        {} as typeof DEFAULT_REPORT_SETTINGS.cash.groups,
      ),
    }
    const visible = visibleCashGroups(cash.outflowGroups, settings)
    expect(visible.map((group) => group.key)).toEqual(['经营'])
    expect(cashTotalOf(visible)).toBeLessThan(cash.outflowTotal)
    expect(cash.reconcile.transferFee).toBeGreaterThan(0)
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

describe('面板切换、确认与刷新保持', () => {
  it('资产负债改按性质汇总：表格 4 行 → 3 行，确认后刷新仍保持，且不发网络写请求', () => {
    const first = renderPage()
    expect(assetRowCount()).toBe(4)

    fireEvent.click(screen.getAllByRole('button', { name: '配置' })[0])
    fireEvent.click(screen.getByRole('button', { name: '按性质汇总' }))
    expect(assetRowCount()).toBe(3)

    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(window.localStorage.getItem(REPORT_SETTINGS_KEY)).toContain('"groupMode":"kind"')
    expect(fetch).not.toHaveBeenCalled()

    first.unmount()
    renderPage(false)
    expect(assetRowCount()).toBe(3)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('取消不落盘：改回按账户后取消，刷新仍是默认', () => {
    const first = renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: '配置' })[0])
    fireEvent.click(screen.getByRole('button', { name: '按性质汇总' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(assetRowCount()).toBe(4)
    expect(window.localStorage.getItem(REPORT_SETTINGS_KEY)).toBeNull()

    first.unmount()
    renderPage(false)
    expect(assetRowCount()).toBe(4)
  })

  it('重置回默认：现金流隐藏分组后重置，表格恢复 2 组', () => {
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: '配置' })[2])
    fireEvent.click(screen.getByRole('button', { name: /账户间转账/ }))
    expect(screen.getAllByText(/已隐藏 1 组/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.queryAllByText(/已隐藏 1 组/)).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(window.localStorage.getItem(REPORT_SETTINGS_KEY)).toContain('"账户间转账":true')
  })

  it('无意义分组给出可见禁用原因（不是 title）', () => {
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: '配置' })[2])
    expect(screen.getByText('本期无投资活动流水')).toBeInTheDocument()
    expect(screen.getByText('本期无筹资活动流水')).toBeInTheDocument()
    expect(screen.getByText('本期无未分类流水')).toBeInTheDocument()
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
