/**
 * P2 #8 / #11 筛选写入 URL 并还原；#17 批量混选列出异类；#9 未来记录不计入本月合计。
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { ToastProvider } from '@/features/shared/toast'
import { BatchBar } from '@/features/transactions/BatchBar'
import { TransactionsList } from '@/features/transactions/TransactionsList'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import { DEFAULT_DISPLAY } from '@/features/transactions/displaySettings'
import {
  EMPTY_ADVANCED,
  normalizeDateRange,
  filterChips,
  filterTransactions,
  groupTransactions,
  readFiltersFromSearch,
  signedMinorText,
  splitTotalsByToday,
  summarizeTransactions,
  writeFiltersToSearch,
  type TransactionFilters,
} from '@/features/transactions/filters'
import type { Ledger } from '@/features/overview/model'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const ledger: Ledger = {
  accounts: [{ id: 'cmb', name: '招商储蓄卡', kind: 'deposit', balance: 100_000 }],
  categories: [
    { id: 'food', name: '餐饮', type: 'expense' },
    { id: 'food_lunch', name: '午餐', type: 'expense', parentId: 'food' },
    { id: 'other', name: '其他', type: 'expense' },
  ],
  budgets: [],
  transactions: [
    { id: 't1', date: '2026-10-05', type: 'expense', categoryId: 'food_lunch', note: '午餐', accountId: 'cmb', amount: 2_000 },
    { id: 't2', date: '2026-10-20', type: 'expense', categoryId: 'other', note: '对账', accountId: 'cmb', amount: 240 },
    { id: 't3', date: '2026-09-10', type: 'expense', categoryId: 'other', note: '上期', accountId: 'cmb', amount: 3_000 },
  ],
}

describe('#8 / #11 筛选写入 URL 并还原', () => {
  const filters: TransactionFilters = {
    query: '',
    type: 'all',
    advanced: {
      ...EMPTY_ADVANCED,
      categoryIds: ['other'],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
    },
  }

  it('往返保留分类 + 期间，且不覆盖预览壳参数', () => {
    const search = writeFiltersToSearch('?page=transactions&device=desktop', filters)
    const params = new URLSearchParams(search)
    expect(params.get('page')).toBe('transactions')
    expect(params.get('device')).toBe('desktop')

    const restored = readFiltersFromSearch(search, ledger)
    expect(restored.filters.advanced.categoryIds).toEqual(['other'])
    expect(restored.filters.advanced.dateFrom).toBe('2026-10-01')
    expect(restored.filters.advanced.dateTo).toBe('2026-10-31')
    expect(restored.dropped).toEqual([])
  })

  it('还原后的筛选只命中对应分类与期间', () => {
    const restored = readFiltersFromSearch(writeFiltersToSearch('', filters), ledger)
    const matched = filterTransactions(ledger, restored.filters)
    expect(matched.map((item) => item.id)).toEqual(['t2'])
  })

  it('无法还原的条件进入 dropped，不静默清空', () => {
    const restored = readFiltersFromSearch('?txCategory=missing&txFrom=bad', ledger)
    expect(restored.dropped).toEqual(['分类', '起始日期'])
  })
})

describe('#17 批量混选列出异类', () => {
  it('列出被排除的记录并提供「仅选支出」', () => {
    const onExpenseOnly = vi.fn()
    render(
      <BatchBar
        device="desktop"
        count={3}
        excluded={[
          { id: 't9', label: '工资', reason: '收入' },
          { id: 't10', label: '账户互转', reason: '转账' },
        ]}
        categoryDisabled
        categoryHint="含转账 / 退款 / 调整，或混选收支类型，不能批量改分类"
        onCategory={() => {}}
        onDelete={() => {}}
        onSelectExpenseOnly={onExpenseOnly}
        onExit={() => {}}
      />,
    )

    expect(screen.getByText(/已排除：工资（收入）、账户互转/)).toBeInTheDocument()
    expect(screen.queryByText(/账户互转（转账）/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '仅选支出' }))
    expect(onExpenseOnly).toHaveBeenCalledTimes(1)
  })

  it('移动端 390：计数独占首行，三颗主按钮在动作行', () => {
    render(
      <BatchBar
        device="mobile"
        count={2}
        excluded={[]}
        categoryHint=""
        onCategory={() => {}}
        onDelete={() => {}}
        onSelectExpenseOnly={() => {}}
        onExit={() => {}}
      />,
    )

    const bar = screen.getByRole('region', { name: '批量操作' })
    expect(bar.className).toContain('is-mobile')
    expect(screen.getByText('已选 2 笔')).toBeInTheDocument()
    for (const name of ['改分类', '删除', '退出']) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeVisible()
      expect(button.closest('.mb-tx-batch-actions')).not.toBeNull()
    }
    expect(screen.queryByRole('button', { name: '仅选支出' })).toBeNull()
  })

  it('移动端混选：排除项可见，且「仅选支出」就在动作行内可点', () => {
    const onExpenseOnly = vi.fn()
    const { container } = render(
      <BatchBar
        device="mobile"
        count={2}
        excluded={[{ id: 't9', label: '工资', reason: '收入' }]}
        categoryDisabled
        categoryHint="含转账 / 退款 / 调整，或混选收支类型，不能批量改分类"
        onCategory={() => {}}
        onDelete={() => {}}
        onSelectExpenseOnly={onExpenseOnly}
        onExit={() => {}}
      />,
    )

    expect(container.querySelector('.mb-tx-batch-meta .mb-tx-batch-summary')?.textContent).toBe(
      '已排除：工资（收入）',
    )
    const only = screen.getByRole('button', { name: '仅选支出' })
    expect(only.closest('.mb-tx-batch-actions')).not.toBeNull()
    fireEvent.click(only)
    expect(onExpenseOnly).toHaveBeenCalledTimes(1)
  })

  it('批量条 CSS 契约：PC 56px；移动两行、主按钮 44px，排除项不再隐藏', () => {
    const variables = readFileSync(resolve(WEB_ROOT, 'src/styles/theme/variables.css'), 'utf8')
    const transactions = readFileSync(
      resolve(WEB_ROOT, 'src/features/transactions/transactions.css'),
      'utf8',
    )
    const shell = readFileSync(resolve(WEB_ROOT, 'src/features/shell/shell.css'), 'utf8')
    expect(variables).toMatch(/--mb-dock-batch-h:\s*56px/)
    expect(transactions).toMatch(/\.mb-tx-batchbar\s*\{[^}]*flex:\s*none/)
    expect(transactions).toMatch(/\.mb-tx-batchbar\s*\{[^}]*height:\s*var\(--mb-dock-batch-h\)/)
    expect(transactions).toMatch(
      /\.mb-tx-batchbar\.is-mobile\s*\{[^}]*min-height:\s*var\(--mb-dock-batch-h\)/,
    )
    expect(transactions).toMatch(/\.mb-tx-batchbar\.is-mobile\s*\{[^}]*flex-direction:\s*column/)
    expect(transactions).toMatch(
      /\.mb-tx-batchbar\.is-mobile \.mb-tx-btn\s*\{[^}]*min-height:\s*var\(--mb-touch\)/,
    )
    expect(transactions).not.toMatch(
      /\.mb-tx-batchbar\.is-mobile \.mb-tx-batch-select-expense\s*\{[^}]*display:\s*none/,
    )
    expect(transactions).not.toMatch(
      /\.mb-tx-batchbar\.is-mobile \.mb-tx-batch-summary\s*\{[^}]*display:\s*none/,
    )
    // 侧栏页脚为贴底按钮预留 38px 按钮高 + 16px 间距，滚动到底不再被压住。
    expect(shell).toMatch(/\.mb-sidebar\s*\{[^}]*padding:[^;]*var\(--mb-control-h\)/)
  })

  it('摘要固定一行：重复类型名只留一次，超出两项折叠成 +N', () => {
    render(
      <BatchBar
        device="desktop"
        count={4}
        excluded={[
          { id: 't1', label: '退款', reason: '退款' },
          { id: 't2', label: '账户互转', reason: '转账' },
          { id: 't3', label: '调整', reason: '调整' },
        ]}
        categoryDisabled
        categoryHint="含转账 / 退款 / 调整，或混选收支类型，不能批量改分类"
        onCategory={() => {}}
        onDelete={() => {}}
        onSelectExpenseOnly={() => {}}
        onExit={() => {}}
      />,
    )

    const summary = screen.getByText(/^已排除：/)
    expect(summary.className).toContain('mb-tx-batch-summary')
    expect(summary.textContent).toBe('已排除：退款、账户互转 +1')
    expect(summary.getAttribute('title')).toBe('已排除：退款、账户互转、调整')
  })
})

describe('#9 未来记录不计入本月合计', () => {
  const futureLedger: Ledger = {
    ...ledger,
    transactions: [
      ...ledger.transactions,
      {
        id: 't4',
        date: '2027-01-05',
        type: 'expense',
        categoryId: 'food',
        note: '年度订阅',
        accountId: 'cmb',
        amount: 1_200,
      },
    ],
  }

  it('合计按今天切分，未来记录单独汇总', () => {
    const all = summarizeTransactions(futureLedger.transactions)
    const { current, future } = splitTotalsByToday(futureLedger.transactions)

    expect(future.count).toBe(1)
    expect(future.net).toBe(-1_200)
    expect(all.count - current.count).toBe(1)
    expect(all.expense - current.expense).toBe(1_200)
  })

  it('页脚合计与笔数都不含未来记录，且不附说明句', () => {
    const { current } = splitTotalsByToday(futureLedger.transactions)
    const { container } = render(
      <TransactionsList
        device="desktop"
        groups={groupTransactions(futureLedger.transactions)}
        ledger={futureLedger}
        batchMode={false}
        display={DEFAULT_DISPLAY}
        selected={new Set<string>()}
        onToggle={() => {}}
        onOpenDetail={() => {}}
      />,
    )

    const flow = container.querySelector('.mb-tx-foot-flow')?.textContent ?? ''
    expect(flow).toContain(signedMinorText(-current.expense))
    expect(flow).not.toContain('¥64.40')

    expect(container.querySelector('.mb-tx-foot-future')).toBeNull()
  })

  it('页头与页脚笔数一致，且均按本月口径不含未来记录', () => {
    const { current } = splitTotalsByToday(futureLedger.transactions)
    const queryClient = new QueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <LedgerProvider initialLedger={futureLedger} dataMode="seed">
            <ToastProvider>
              <TransactionsPage
                device="desktop"
                dataState="normal"
                batchMode={false}
                onBatchModeChange={() => {}}
                displayOpen={false}
                onDisplayToggle={() => {}}
                onRetry={() => {}}
                onCreateAccount={() => {}}
                onImport={() => {}}
              />
            </ToastProvider>
          </LedgerProvider>
        </MantineProvider>
      </QueryClientProvider>,
    )

    // 原缺陷：页头用筛选总数（4 笔）又叠加「另有 1 笔未来」，读起来像 4+1。
    expect(current.count).toBe(3)
    const head = container.querySelector('.mb-page-sub')?.textContent ?? ''
    expect(head).toBe('共 3 笔')
    const foot = container.querySelector('.mb-tx-foot-count')?.textContent ?? ''
    expect(foot).toBe('共 3 笔')
  })
})

describe('K1 未来分组按各自日期拆分', () => {
  const futureTransactions = [
    { id: 'f1', date: '2026-12-20', type: 'expense' as const, categoryId: 'other', note: '未来 A', accountId: 'cmb', amount: 500 },
    { id: 'f2', date: '2026-12-25', type: 'expense' as const, categoryId: 'other', note: '未来 B', accountId: 'cmb', amount: 600 },
    { id: 'f3', date: '2027-01-03', type: 'expense' as const, categoryId: 'other', note: '未来 C', accountId: 'cmb', amount: 700 },
    { id: 'p1', date: '2026-11-05', type: 'expense' as const, categoryId: 'other', note: '当期', accountId: 'cmb', amount: 800 },
  ]

  it('跨月/跨年的未来记录各自成组，组头带年份', () => {
    const groups = groupTransactions(futureTransactions, '2026-11-06')
    const future = groups.filter((group) => group.future)
    expect(future.map((group) => group.date)).toEqual(['2026-12-20', '2026-12-25', '2027-01-03'])
    expect(future.map((group) => group.label)).toEqual([
      '未来 · 2026年12月20日 周日',
      '未来 · 2026年12月25日 周五',
      '未来 · 2027年1月3日 周日',
    ])
    expect(future.map((group) => group.items.length)).toEqual([1, 1, 1])
  })
})

describe('K4 起止反选自动交换，chip 与控件日期口径一致', () => {
  it('起晚于止时交换两端', () => {
    const next = normalizeDateRange({
      ...EMPTY_ADVANCED,
      dateFrom: '2026-11-05',
      dateTo: '2026-11-01',
    })
    expect(next.dateFrom).toBe('2026-11-01')
    expect(next.dateTo).toBe('2026-11-05')
  })

  it('URL 还原时同样纠正反选区间，不会得到空列表', () => {
    const restored = readFiltersFromSearch('?txFrom=2026-11-05&txTo=2026-11-01', ledger)
    expect(restored.filters.advanced.dateFrom).toBe('2026-11-01')
    expect(restored.filters.advanced.dateTo).toBe('2026-11-05')
    expect(restored.dropped).toEqual([])
  })

  it('日期 chip 与控件、URL 参数统一为 YYYY-MM-DD', () => {
    const chips = filterChips(ledger, {
      query: '',
      type: 'all',
      advanced: { ...EMPTY_ADVANCED, dateFrom: '2026-11-01', dateTo: '2026-11-05' },
    })
    expect(chips.find((chip) => chip.key === 'date')?.label).toBe('日期：2026-11-01–2026-11-05')
  })
})

describe('关键词口径：只搜文本，不搜金额（与 API 一致）', () => {
  const amountLedger: Ledger = {
    ...ledger,
    transactions: [
      {
        id: 't-amount',
        date: '2026-10-05',
        type: 'expense',
        categoryId: 'food_lunch',
        note: '工作餐',
        accountId: 'cmb',
        amount: 32_800,
      },
    ],
  }

  const idsFor = (query: string, advanced = EMPTY_ADVANCED) =>
    filterTransactions(amountLedger, {
      query,
      type: 'all',
      advanced: { ...advanced, categoryIds: [] },
    }).map((transaction) => transaction.id)

  it('金额文本（328）不再命中关键词', () => {
    expect(idsFor('328')).toEqual([])
    expect(idsFor('328.00')).toEqual([])
  })

  it('备注 / 账户 / 分类 / 方向仍命中', () => {
    expect(idsFor('工作餐')).toEqual(['t-amount'])
    expect(idsFor('午餐')).toEqual(['t-amount'])
    expect(idsFor('招商')).toEqual(['t-amount'])
    expect(idsFor('支出')).toEqual(['t-amount'])
  })

  it('金额区间筛选不受影响', () => {
    expect(idsFor('', { ...EMPTY_ADVANCED, amountMin: '328', amountMax: '328' })).toEqual([
      't-amount',
    ])
  })
})
