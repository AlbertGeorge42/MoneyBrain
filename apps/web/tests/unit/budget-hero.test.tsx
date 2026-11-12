/**
 * 预算头部徽标与超支行置顶（P2 #6）
 *
 * 复现原缺陷：购物已超支时头部仍写「按计划」；超支行埋在列表末尾。
 * 断言结构：徽标按单项超支优先输出「N 项超支」，支出组第一行为超支行。
 * 用量由后端提供：API 模式下随账本 snapshot 带入 budgets[].used，前端不再重算。
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { BudgetPage } from '@/features/budgets/BudgetPage'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import type { Ledger } from '@/features/overview/model'
import { createSeedLedger } from '@/dev-fixtures/seed'

/** 后端 statuses 的用量：购物 125,720 / 80,000（超支），娱乐 7,900 / 9,000（接近上限）。 */
const USED: Record<string, number> = {
  b_food: 28_600,
  b_home: 560_000,
  b_shop: 125_720,
  b_fun: 7_900,
  b_traffic: 600,
  b_edu: 0,
  b_salary: 1_850_000,
  b_move: 500_000,
}

/** API 账本：snapshot 提供 today，预算用量随账本带入（BudgetPage 直接消费）。 */
function apiLedger(): Ledger {
  const seed = createSeedLedger()
  return {
    ...seed,
    snapshot: { today: '2026-10-28' } as never,
    budgets: seed.budgets.map((budget) => ({ ...budget, used: USED[budget.id] })),
  }
}

function renderBudget() {
  return render(
    <MantineProvider>
      <LedgerProvider initialLedger={apiLedger()}>
        <BudgetPage
          device="desktop"
          dataState="ready"
          editorOpen={false}
          onEditorOpenChange={() => {}}
          onRetry={() => {}}
          onViewFlow={() => {}}
          notify={() => {}}
        />
      </LedgerProvider>
    </MantineProvider>,
  )
}

describe('预算头部徽标', () => {
  it('存在单项超支时优先显示「N 项超支」而不是按计划', () => {
    const { container } = renderBudget()
    const badge = container.querySelector('.mb-bg-hero-badge')

    expect(badge?.getAttribute('data-level')).toBe('over')
    expect(badge?.textContent).toContain('1 项超支')
    expect(badge?.querySelector('svg')).not.toBeNull()
    expect(screen.queryByText('按计划')).toBeNull()
  })

  it('超支行排在支出组第一行', () => {
    const { container } = renderBudget()
    const expense = container.querySelector('.mb-bg-group[data-type="expense"]')
    const names = Array.from(expense?.querySelectorAll('.mb-bg-name') ?? []).map(
      (node) => node.textContent,
    )

    expect(names[0]).toBe('购物')
  })
})
