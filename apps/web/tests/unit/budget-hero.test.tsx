/**
 * 预算头部徽标与超支行置顶（P2 #6）
 *
 * 复现原缺陷：购物已超支时头部仍写「按计划」；超支行埋在列表末尾。
 * 断言结构：徽标按单项超支优先输出「N 项超支」，支出组第一行为超支行。
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { BudgetPage } from '@/features/budgets/BudgetPage'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { createSeedLedger } from '@/dev-fixtures/seed'

function renderBudget() {
  return render(
    <MantineProvider>
      <LedgerProvider initialLedger={createSeedLedger()} dataMode="seed">
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
