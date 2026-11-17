/**
 * 四条环形图下钻链路统一回归：
 * 收支 / 资产负债 / 现金流 / 总览都构造同一份 DrillTarget，走同一个 buildDrillFor + DrillDrawer。
 *
 * 守护点：
 * - 分类目标按子树方向筛选；多分类「其余」合并桶同口径。
 * - 账户目标同时收揽转出与转入，合并桶不再因「多账户」禁用。
 * - 抽屉用流水页的 TxRow，点行打开可编辑详情；不再跳流水页，也不再截断到 4 笔。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DrillDrawer } from '@/features/reports/DrillDrawer'
import { buildDrillFor, type DrillTarget } from '@/features/reports/reportsModel'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { ToastProvider } from '@/features/shared/toast'
import type { Ledger } from '@/features/overview/model'

const ledger: Ledger = {
  accounts: [
    { id: 'cash', name: '现金', kind: 'cash', balance: 0 },
    { id: 'bank', name: '银行卡', kind: 'cash', balance: 0 },
  ],
  categories: [
    { id: 'food', name: '餐饮', type: 'expense' },
    { id: 'lunch', name: '午餐', type: 'expense', parentId: 'food' },
    { id: 'dinner', name: '晚餐', type: 'expense', parentId: 'food' },
    { id: 'salary', name: '工资', type: 'income' },
  ],
  budgets: [],
  transactions: [
    { id: 't1', date: '2026-10-05', type: 'expense', categoryId: 'lunch', accountId: 'cash', note: '', amount: 3000 },
    { id: 't2', date: '2026-10-06', type: 'expense', categoryId: 'dinner', accountId: 'bank', note: '', amount: 2000 },
    { id: 't3', date: '2026-10-07', type: 'income', categoryId: 'salary', accountId: 'cash', note: '', amount: 10000 },
    { id: 't4', date: '2026-10-08', type: 'transfer', categoryId: '', accountId: 'bank', toAccountId: 'cash', note: '', amount: 5000 },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `more-${index}`,
      date: `2026-10-${10 + index}`,
      type: 'expense' as const,
      categoryId: 'lunch',
      accountId: 'cash',
      note: '',
      amount: 100,
    })),
  ],
}
const from = '2026-10-01'
const to = '2026-10-31'

const categoryTarget = (over: Partial<Extract<DrillTarget, { type: 'category' }>> = {}): DrillTarget => ({
  type: 'category',
  title: '餐饮',
  amount: 5000,
  childTitle: '二级类别',
  children: [],
  ids: ['food'],
  side: 'expense',
  ...over,
})
const accountTarget = (over: Partial<Extract<DrillTarget, { type: 'account' }>> = {}): DrillTarget => ({
  type: 'account',
  title: '现金',
  amount: 3000,
  childTitle: '账户',
  children: [],
  ids: ['cash'],
  ...over,
})

describe('buildDrillFor 统一下钻数据', () => {
  it('分类目标按子树方向筛选，且不再截断到 4 笔', () => {
    const drill = buildDrillFor(ledger, categoryTarget(), from, to)
    expect(drill.title).toBe('餐饮')
    expect(drill.tone).toBe('expense')
    expect(drill.transactions).toHaveLength(7)
    expect(drill.transactions.every((row) => row.type === 'expense')).toBe(true)
  })

  it('多分类「其余」合并桶按并集筛选，子项栏标题沿用调用方语义', () => {
    const drill = buildDrillFor(
      ledger,
      categoryTarget({ title: '其余 2 类', ids: ['food', 'salary'], childTitle: '分类' }),
      from,
      to,
    )
    expect(drill.childTitle).toBe('分类')
    // 支出方向：工资流水不进，只有餐饮子树。
    expect(drill.transactions).toHaveLength(7)
  })

  it('账户目标同时收揽转出与转入转账', () => {
    const drill = buildDrillFor(ledger, accountTarget(), from, to)
    expect(drill.transactions.map((row) => row.id)).toContain('t4')
    expect(drill.transactions.map((row) => row.id)).toContain('t3')
  })

  it('账户合并「其余」保留全部账户的明细', () => {
    const drill = buildDrillFor(
      ledger,
      accountTarget({ title: '其余 2 个账户', ids: ['cash', 'bank'] }),
      from,
      to,
    )
    expect(drill.amount).toBe(3000)
    expect(drill.transactions).toHaveLength(9)
  })
})

describe('DrillDrawer 语义化渲染', () => {
  const renderDrawer = (data: ReturnType<typeof buildDrillFor>) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    return render(
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <LedgerProvider initialLedger={ledger}>
            <ToastProvider>
              <DrillDrawer device="desktop" data={data} onClose={vi.fn()} />
            </ToastProvider>
          </LedgerProvider>
        </MantineProvider>
      </QueryClientProvider>,
    )
  }

  it('按 childTitle 渲染子项栏：账户 / 分类 / 二级类别', () => {
    renderDrawer(buildDrillFor(ledger, accountTarget({ childTitle: '账户' }), from, to))
    expect(screen.getByText('账户')).toBeTruthy()
  })

  it('总览无子项时不渲染子项栏', () => {
    renderDrawer(buildDrillFor(ledger, categoryTarget({ childTitle: '' }), from, to))
    expect(screen.queryByText('二级类别')).toBeNull()
    expect(screen.queryByText('分类')).toBeNull()
  })

  it('相关流水用流水页 TxRow 渲染全部条目，无「在流水中查看」', () => {
    renderDrawer(buildDrillFor(ledger, categoryTarget(), from, to))
    expect(screen.queryByRole('button', { name: '在流水中查看' })).toBeNull()
    expect(screen.getByText(/共 7 笔/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /午餐/ })).toHaveLength(6)
  })

  it('点流水行打开可编辑详情抽屉', () => {
    renderDrawer(buildDrillFor(ledger, categoryTarget({ ids: ['food'] }), from, to))
    fireEvent.click(screen.getAllByRole('button', { name: /午餐/ })[0])
    expect(screen.getByText('交易详情')).toBeTruthy()
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
  })
})
