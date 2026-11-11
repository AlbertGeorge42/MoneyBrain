/**
 * 报表设置与报表版式回归：
 * - 点设置直达当前报表对应的分类管理，只有一层抽屉、不带其他报表分区切换；
 * - 只有收支明细提供数据范围开关，不再有显示口径配置；
 * - 资产负债表固定「账户分类 → 账户」折叠结构，默认收起，移除净资产卡 / 覆盖说明；
 * - 三张双表报表的合计行强制对齐。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerContext, type LedgerContextValue } from '@/features/overview/ledgerStore'
import { ToastProvider } from '@/features/shared/toast'
import { TODAY, deriveExpenseCharts } from '@/features/overview/model'
import { createSeedLedger } from '@/dev-fixtures/seed'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { BalanceView } from '@/features/reports/BalanceView'
import {
  DEFAULT_REPORT_SETTINGS,
  REPORT_SETTINGS_KEY,
  loadReportSettings,
  normalizeReportSettings,
  saveReportSettings,
} from '@/features/reports/reportSettings'
import {
  mapBalanceReport,
  mapCashReport,
  mapFlowReport,
} from '@/features/reports/apiReports'

const mockReports = vi.hoisted(() => ({
  balance: null as unknown,
  flow: null as unknown,
  cash: null as unknown,
  invest: null as unknown,
}))

vi.mock('@/features/reports/apiReports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/reports/apiReports')>()
  const ok = (data: unknown) =>
    ({ data, status: 'success', error: null, refetch: () => {} }) as never
  return {
    ...actual,
    useApiBalanceReport: () => ok(mockReports.balance),
    useApiFlowReport: () => ok(mockReports.flow),
    useApiCashReport: () => ok(mockReports.cash),
    useApiInvestReport: () => ok(mockReports.invest),
    useApiAssetProjection: () => ok(mockReports.balance),
    useApiCashProjection: () => ok(mockReports.cash),
    useApiIncomeExpenseProjection: () => ok(mockReports.flow),
  }
})

const ledger = createSeedLedger()
// 账本不带 accountCategories：表格仍应按后端 assetNodes 的分类名呈现层级。
const apiLedger = {
  ...ledger,
  accountCategories: undefined,
  snapshot: { today: TODAY, expenseCharts: deriveExpenseCharts(ledger) } as never,
}
const monthFrom = `${TODAY.slice(0, 7)}-01`

/** 3 个资产分类 / 6 个账户、1 个负债分类 / 1 个账户。 */
const UI_BALANCE = {
  date: TODAY,
  assets: { actual: 16_173_915, predicted: 0 },
  liabilities: { actual: 211_840, predicted: 0 },
  netWorth: { actual: 15_962_075, predicted: 0 },
  assetNodes: [
    {
      id: 'ac-invest',
      name: '投资',
      actual: 9_645_000,
      children: [
        { id: 'brk', name: '长桥证券', actual: 8_645_000 },
        { id: 'xq', name: '雪球基金', actual: 1_000_000 },
      ],
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
      actual: 501_220,
      children: [
        { id: 'wx', name: '微信零钱', actual: 124_020 },
        { id: 'zfb', name: '支付宝', actual: 376_200 },
        { id: 'wallet', name: '钱包', actual: 1_000 },
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
} as never

const UI_FLOW = {
  income: { actual: 50_000 },
  expense: { actual: 36_000 },
  balance: { actual: 14_000 },
  incomeCategoryDetails: [
    {
      name: '工资',
      categoryId: 'salary',
      actual: 50_000,
      children: [{ name: '奖金', categoryId: 'bonus', actual: 10_000, children: [] }],
    },
  ],
  expenseCategoryDetails: [
    { name: '餐饮', categoryId: 'food', actual: 20_000, children: [] },
    { name: '交通', categoryId: 'transit', actual: 10_000, children: [] },
    { name: '居住', categoryId: 'home', actual: 6_000, children: [] },
  ],
} as never

/** 流出有 2 个活动分组，流入为空：正好覆盖空表也补齐行数的情况。 */
const UI_CASH = {
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
        { categoryName: '教育', categoryId: 'edu', actual: -19_900, direction: 'outflow', type: 'expense' },
      ],
    },
    investing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
    financing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
    uncategorized: {
      inflow: { actual: 0 },
      outflow: { actual: -50_000 },
      net: { actual: -50_000 },
      items: [
        { categoryName: '账户互转', categoryId: 'move', actual: -50_000, direction: 'outflow', type: 'transfer_out' },
      ],
    },
  },
} as never

mockReports.balance = mapBalanceReport(UI_BALANCE, [], apiLedger)
mockReports.flow = mapFlowReport(UI_FLOW, [], apiLedger, monthFrom, TODAY)
mockReports.cash = mapCashReport(UI_CASH, apiLedger, monthFrom, TODAY)

const contextValue = {
  ledger: apiLedger,
  dataMode: 'api' as const,
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransactions: vi.fn(),
  setTransactionCategory: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  reorderAccountTo: vi.fn(),
  reorderAccountGroupTo: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  moveCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reorderCategoryTo: vi.fn(),
  undo: vi.fn(),
  replaceLedger: vi.fn(),
} as unknown as LedgerContextValue

function renderPage() {
  const queryClient = new QueryClient()
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <LedgerContext.Provider value={contextValue}>
          <ToastProvider>
            <ReportsPage
              device="desktop"
              dataState="normal"
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

async function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  await screen.findByRole('dialog')
}

async function openSettingsOf(label: string) {
  fireEvent.click(screen.getByRole('tab', { name: label }))
  await openSettings()
}

/** 数据行数（不含 .is-pad 补齐行与 tfoot 合计行）。 */
function dataRows(label: string) {
  return screen.getByLabelText(label).querySelectorAll('tbody tr:not(.is-pad)')
}

/** 含补齐行的 tbody 行数：两表相等才能说明合计行同 y。 */
function bodyRows(label: string) {
  return screen.getByLabelText(label).querySelectorAll('tbody tr').length
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('报表设置直达单一分区', () => {
  it('点击设置只有一层抽屉：直接是账户分类，没有二级入口与其他分区页签', async () => {
    renderPage()
    await openSettings()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText('资产负债设置')).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: '账户分组' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '收支分类' })).toBeNull()
    expect(screen.queryByRole('tab', { name: '现金流分类' })).toBeNull()
    expect(screen.queryByRole('button', { name: /管理/ })).toBeNull()
    expect(screen.queryByText('分组口径')).toBeNull()
    expect(screen.queryByText('列显示')).toBeNull()
    expect(screen.queryByRole('button', { name: '对账' })).toBeNull()
    expect(screen.getByRole('button', { name: '完成' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重置' })).toBeNull()
  })

  it('其余三张报表各自直达对应分区，且不显示数据范围', async () => {
    const first = renderPage()
    await openSettingsOf('收支明细')
    expect(screen.getByText('收支明细设置')).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: '收支分类' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: '账户分组' })).toBeNull()
    first.unmount()

    const second = renderPage()
    await openSettingsOf('现金流')
    expect(screen.getByText('现金流设置')).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: '现金流分类' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: '账户分组' })).toBeNull()
    expect(screen.queryByText('数据范围')).toBeNull()
    second.unmount()

    renderPage()
    await openSettingsOf('投资分析')
    expect(screen.getByText('投资分析设置')).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: '账户分组' })).toBeInTheDocument()
  })

  it('空存储与旧版本脏存储都回到只有数据范围的默认配置', () => {
    expect(loadReportSettings()).toEqual(DEFAULT_REPORT_SETTINGS)
    expect(
      normalizeReportSettings({
        balance: { groupMode: 'kind', showKindColumn: false },
        flow: { namedCategories: 5 },
        cash: { groups: { 经营: false } },
        invest: { sortBy: 'rate', snapshotCount: 3 },
        dataScope: { includeExcluded: 'yes' },
      }),
    ).toEqual(DEFAULT_REPORT_SETTINGS)
  })

  it('数据范围切换立即生效并落盘，刷新保持，不发网络写请求', async () => {
    const first = renderPage()
    await openSettingsOf('收支明细')
    const toggle = screen.getByRole('button', { name: /含不计收支交易/ })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(window.localStorage.getItem(REPORT_SETTINGS_KEY)).toContain('"includeExcluded":true')
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    first.unmount()

    renderPage()
    await openSettingsOf('收支明细')
    expect(
      screen.getByRole('button', { name: /含不计收支交易/ }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('保存后 load 读回同一份配置', () => {
    const settings = normalizeReportSettings({ dataScope: { includeExcluded: true } })
    saveReportSettings(settings)
    expect(loadReportSettings()).toEqual(settings)
  })
})

describe('资产负债表：分类折叠层级', () => {
  it('默认全部折叠，只列账户分类；不再有净资产卡与账户覆盖说明', () => {
    renderPage()
    expect(dataRows('资产明细')).toHaveLength(3)
    expect(dataRows('负债明细')).toHaveLength(1)
    expect(screen.getByLabelText('资产明细').textContent).toContain('投资')
    expect(document.querySelector('.mb-rp-networth')).toBeNull()
    expect(screen.queryByText(/账户覆盖/)).toBeNull()
  })

  it('展开分类后列出该分类下的账户', () => {
    renderPage()
    const table = screen.getByLabelText('资产明细')
    const folds = table.querySelectorAll('button.mb-rp-fold')
    expect(folds).toHaveLength(3)
    fireEvent.click(folds[0])
    expect(table.querySelectorAll('tr.is-child')).toHaveLength(2)
    expect(table.textContent).toContain('长桥证券')
    expect(table.textContent).toContain('雪球基金')
  })

  it('资产 / 负债两表补齐到同高，合计行严格对齐', () => {
    renderPage()
    expect(bodyRows('资产明细')).toBe(bodyRows('负债明细'))
    expect(screen.getByLabelText('资产明细').querySelector('tfoot')?.textContent).toContain('合计')
    expect(screen.getByLabelText('负债明细').querySelector('tfoot')?.textContent).toContain('合计')
  })

  it('表格与收支表同为四列，分类行带占比', () => {
    renderPage()
    const table = screen.getByLabelText('资产明细')
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual([
      '分类 / 账户',
      '账户数',
      '金额',
      '占比',
    ])
    const firstRow = table.querySelector('tbody tr')!
    expect(firstRow.textContent).toContain('投资')
    expect(firstRow.textContent).toContain('%')
  })
})

describe('资产负债表：走势在前、单框双环按分类占比', () => {
  it('净值走势之后只有一个构成框，资产 / 负债两环并排在同一框内', () => {
    renderPage()
    const cards = Array.from(document.querySelectorAll('.mb-rp-chart-card'))
    expect(cards.map((card) => card.querySelector('.mb-rp-sec-title')?.textContent)).toEqual([
      '净值走势',
      '资产 / 负债构成',
    ])
    const sides = cards[1].querySelectorAll('.mb-rp-compare-side')
    expect(sides).toHaveLength(2)
    expect(sides[0].querySelector('.mb-rp-compare-title')?.textContent).toBe('资产构成')
    expect(sides[1].querySelector('.mb-rp-compare-title')?.textContent).toBe('负债构成')
    const assetLegend = sides[0].querySelector('.mb-rp-donut-legend')?.textContent ?? ''
    expect(assetLegend).toContain('投资')
    expect(assetLegend).toContain('储蓄')
    expect(assetLegend).toContain('现金等价')
    expect(sides[0].querySelectorAll('.mb-rp-donut-slice[data-view="root"]')).toHaveLength(3)
    expect((sides[1].querySelector('.mb-rp-donut-legend')?.textContent ?? '')).toContain('信用账户')
  })
})

describe('账户分类按设置平铺（真实库父子结构）', () => {
  it('「资产」父分类下的「现金 / 投资」在表格与环图里仍是独立分组', () => {
    const categories = [
      { id: 'root-asset', name: '资产', type: 'asset' as const, parentId: null, sort: 0 },
      { id: 'sub-cash', name: '现金', type: 'asset' as const, parentId: 'root-asset', sort: 1 },
      { id: 'sub-invest', name: '投资', type: 'asset' as const, parentId: 'root-asset', sort: 2 },
      { id: 'root-debt', name: '负债', type: 'liability' as const, parentId: null, sort: 3 },
    ]
    const balance = {
      date: TODAY,
      assets: { actual: 1_100_000, predicted: 0 },
      liabilities: { actual: 0, predicted: 0 },
      netWorth: { actual: 1_100_000, predicted: 0 },
      assetNodes: [
        {
          id: 'root-asset', name: '资产', actual: 100_000,
          children: [{ id: 'a1', name: '公积金', actual: 100_000, categoryId: 'root-asset' }],
        },
        {
          id: 'sub-cash', name: '现金', actual: 600_000,
          children: [{ id: 'a2', name: '微信', actual: 600_000, categoryId: 'sub-cash' }],
        },
        {
          id: 'sub-invest', name: '投资', actual: 400_000,
          children: [{ id: 'a3', name: '雪球', actual: 400_000, categoryId: 'sub-invest' }],
        },
      ],
      liabilityNodes: [],
    } as never
    const report = mapBalanceReport(
      balance,
      [{ label: '本期', netWorth: 1_100_000 }],
      createSeedLedger(),
    )
    render(
      <MantineProvider>
        <BalanceView
          device="desktop"
          report={report}
          categories={categories}
          side="assets"
          onSide={() => {}}
          from={monthFrom}
          to={TODAY}
          onViewFlow={() => {}}
        />
      </MantineProvider>,
    )
    const table = screen.getByLabelText('资产明细')
    // 默认折叠：三个分类各自一行、各带一个折叠按钮，不并成一组「资产」。
    expect(table.querySelectorAll('tbody tr:not(.is-pad)')).toHaveLength(3)
    expect(table.querySelectorAll('button.mb-rp-fold')).toHaveLength(3)
    expect(table.textContent).toContain('现金')
    expect(table.textContent).toContain('投资')
    // 资产环也按三个分类切块，而不是只画一个「资产」扇区。
    const assetSide = document.querySelectorAll('.mb-rp-compare-side')[0]
    expect(assetSide.querySelectorAll('.mb-rp-donut-slice[data-view="root"]')).toHaveLength(3)
  })
})

describe('收支明细 / 现金流：合计行强制对齐', () => {
  it('收支两表按较多者补齐，默认折叠只列一级分类', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '收支明细' }))
    expect(dataRows('收入构成')).toHaveLength(1)
    expect(dataRows('支出构成')).toHaveLength(3)
    expect(bodyRows('收入构成')).toBe(bodyRows('支出构成'))
  })

  it('现金流空流入表也补齐到与流出表同高', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '现金流' }))
    expect(dataRows('现金流出')).toHaveLength(2)
    expect(bodyRows('现金流入')).toBe(bodyRows('现金流出'))
  })
})
