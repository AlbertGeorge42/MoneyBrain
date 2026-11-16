/**
 * 四条环形图下钻链路统一回归：
 * 收支 / 资产负债 / 现金流 / 总览都构造同一份 DrillTarget，
 * 走同一个 buildDrillFor + DrillDrawer（环 → 抽屉 → 流水）。
 *
 * 守护点：
 * - 分类目标按子树方向筛选；多分类「其余」合并桶同口径。
 * - 账户目标按 accountId 筛选；其余账户合并桶 canViewFlow=false。
 * - 抽屉按 childTitle 渲染语义化子项栏；总览无子项时该栏不渲染。
 * - 其余账户禁用「在流水中查看」并给出可见说明。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DrillDrawer } from '@/features/reports/DrillDrawer'
import { buildDrillFor, type DrillTarget } from '@/features/reports/reportsModel'
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
  canViewFlow: true,
  ...over,
})
const accountTarget = (over: Partial<Extract<DrillTarget, { type: 'account' }>> = {}): DrillTarget => ({
  type: 'account',
  title: '现金',
  amount: 3000,
  childTitle: '账户',
  children: [],
  ids: ['cash'],
  canViewFlow: true,
  ...over,
})

describe('buildDrillFor 统一下钻数据', () => {
  it('分类目标按子树收揽流水，方向与金额同口径', () => {
    const drill = buildDrillFor(ledger, categoryTarget(), from, to)
    expect(drill.title).toBe('餐饮')
    expect(drill.tone).toBe('expense')
    expect(drill.transactions).toHaveLength(2)
    expect(drill.transactions.reduce((sum, row) => sum + row.amount, 0)).toBe(5000)
    expect(drill.canViewFlow).toBe(true)
  })

  it('多分类「其余」合并桶按并集筛选，子项栏标题沿用调用方语义', () => {
    const drill = buildDrillFor(
      ledger,
      categoryTarget({ title: '其余 2 类', ids: ['food', 'salary'], childTitle: '分类' }),
      from,
      to,
    )
    expect(drill.childTitle).toBe('分类')
    // 支出方向：工资流水不进，只有餐饮子树两笔。
    expect(drill.transactions).toHaveLength(2)
  })

  it('账户目标按 accountId 筛选，与分类方向无关', () => {
    const drill = buildDrillFor(ledger, accountTarget(), from, to)
    expect(drill.transactions).toHaveLength(2) // 现金：t1 支出 + t3 收入
    expect(drill.transactions.map((row) => row.id)).toEqual(['t3', 't1'])
  })

  it('账户合并「其余」保留金额与明细，仅禁用跳流水', () => {
    const drill = buildDrillFor(
      ledger,
      accountTarget({ title: '其余 2 个账户', ids: ['cash', 'bank'], canViewFlow: false }),
      from,
      to,
    )
    expect(drill.amount).toBe(3000)
    expect(drill.transactions).toHaveLength(3)
    expect(drill.canViewFlow).toBe(false)
  })
})

describe('DrillDrawer 语义化渲染', () => {
  const renderDrawer = (data: ReturnType<typeof buildDrillFor>, onViewFlow = vi.fn()) => {
    const result = render(
      <MantineProvider>
        <DrillDrawer device="desktop" data={data} onClose={() => {}} onViewFlow={onViewFlow} />
      </MantineProvider>,
    )
    return { ...result, onViewFlow }
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

  it('其余账户禁用「在流水中查看」且给出可见说明', () => {
    const { onViewFlow } = renderDrawer(
      buildDrillFor(ledger, accountTarget({ canViewFlow: false }), from, to),
    )
    const button = screen.getByRole('button', { name: '在流水中查看' })
    expect(button).toBeDisabled()
    expect(screen.getByText(/流水筛选暂不支持多选/)).toBeTruthy()
    fireEvent.click(button)
    expect(onViewFlow).not.toHaveBeenCalled()
  })

  it('普通下钻可点「在流水中查看」', () => {
    const { onViewFlow } = renderDrawer(buildDrillFor(ledger, categoryTarget(), from, to))
    const button = screen.getByRole('button', { name: '在流水中查看' })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(onViewFlow).toHaveBeenCalledTimes(1)
  })
})
