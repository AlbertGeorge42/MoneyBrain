/**
 * 预算页数据模型单测（HF 修复批次）
 *
 * 覆盖三类预算、80–100% warning、超支金额、收入达成、转账不计入预算与历史月份结算。
 */
import { describe, expect, it } from 'vitest'
import { createSeedLedger } from '@/features/overview/model'
import { createBudgetId, deriveBudgetPage, shiftMonth } from '@/features/budgets/budgetModel'

describe('预算页数据', () => {
  const ledger = createSeedLedger()
  const page = deriveBudgetPage(ledger, '2026-10')

  it('支出合计与总预算对齐种子', () => {
    expect(page.expense.used).toBe(742_720)
    expect(page.expense.limit).toBe(1_009_000)
    expect(page.expense.percent).toBeCloseTo(73.6, 1)
    expect(page.expense.remaining).toBe(266_280)
  })

  it('存在一行超支与一行 80–100% warning', () => {
    expect(page.over.map((row) => row.id)).toEqual(['b_shop'])
    expect(page.over[0].status).toBe('超支 ¥457.20')
    expect(page.near.map((row) => row.id)).toContain('b_fun')
    expect(page.near.find((row) => row.id === 'b_fun')?.percent).toBeCloseTo(87.8, 1)
    const food = page.groups[0].rows.find((row) => row.id === 'b_food')
    expect(food?.status).toBe('剩余 ¥1,214.00')
  })

  it('收入达成；转账不计入预算告警', () => {
    const income = page.groups.find((group) => group.type === 'income')?.rows[0]
    const transfer = page.groups.find((group) => group.type === 'transfer')?.rows[0]
    expect(income?.level).toBe('achieved')
    expect(income?.status).toBe('已达成')
    expect(transfer?.percent).toBe(100)
    expect(transfer?.level).toBe('neutral')
    expect(transfer?.status).toBe('不计入预算')
  })

  it('收入未达成判 normal，不显示「接近上限」', () => {
    const halfGoal = {
      ...ledger,
      budgets: ledger.budgets.map((budget) =>
        budget.id === 'b_salary' ? { ...budget, limit: 3_700_000 } : budget,
      ),
    }
    const page = deriveBudgetPage(halfGoal, '2026-10')
    const income = page.groups.find((group) => group.type === 'income')?.rows[0]
    expect(income?.percent).toBeCloseTo(50, 1)
    expect(income?.level).toBe('normal')
    expect(income?.status).toBe('还差 ¥18,500.00')
  })

  it('历史月份按月末结算，没有流水时使用为 0', () => {
    const previous = deriveBudgetPage(ledger, '2025-09')
    expect(previous.expense.used).toBe(0)
    expect(previous.expense.percent).toBe(0)
    expect(previous.monthLabel).toBe('2025 年 9 月')
  })

  it('月份前后切换跨年正确', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('新增预算编号递增', () => {
    expect(createBudgetId(ledger.budgets)).toBe('b_1')
  })
})
