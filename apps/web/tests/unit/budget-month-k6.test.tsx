/**
 * 预算期间锚点与无数据原因（K6）
 *
 * 锚点跟真实数据走（有 11 月流水即停在 11 月）；「下一个月」无流水时禁用，
 * 但必须给出可见原因文字，而不是只 disabled。有数据时下一个月可点并真的切过去。
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { BudgetPage } from '@/features/budgets/BudgetPage'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import type { Ledger } from '@/features/overview/model'
import { createSeedLedger } from '@/dev-fixtures/seed'

function renderBudget(ledger: Ledger) {
  return render(
    <MantineProvider>
      <LedgerProvider initialLedger={ledger} dataMode="seed">
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

/** 种子账本 + 一笔 11-05 流水：锚点应离开种子的 2026-10-28。 */
function ledgerWithNovember(): Ledger {
  const seed = createSeedLedger()
  return {
    ...seed,
    transactions: [
      ...seed.transactions,
      {
        id: 't_nov',
        date: '2026-11-05',
        type: 'expense',
        categoryId: 'food_lunch',
        note: '十一月午餐',
        accountId: 'wx',
        amount: 2_800,
      },
    ],
  }
}

describe('K6 预算月份锚点', () => {
  it('锚点跟最新流水走；无数据的下一个月禁用且有可见原因', () => {
    const { container } = renderBudget(ledgerWithNovember())

    expect(container.querySelector('.mb-bg-month-label')?.textContent).toBe('2026 年 11 月')
    const next = screen.getByRole('button', { name: '下一个月' })
    expect(next).toBeDisabled()
    expect(next.getAttribute('title')).toContain('2026 年 12 月没有流水')
    expect(container.querySelector('.mb-bg-month-reason')?.textContent).toBe('2026 年 12 月无流水')
  })

  it('有数据的月份可切回：上一个月到 10 月后，下一个月可点并真的回到 11 月', () => {
    const { container } = renderBudget(ledgerWithNovember())
    const label = () => container.querySelector('.mb-bg-month-label')?.textContent

    fireEvent.click(screen.getByRole('button', { name: '上一个月' }))
    expect(label()).toBe('2026 年 10 月')

    const next = screen.getByRole('button', { name: '下一个月' })
    expect(next).toBeEnabled()
    expect(next.getAttribute('aria-disabled')).toBe('false')
    expect(container.querySelector('.mb-bg-month-reason')).toBeNull()

    fireEvent.click(next)
    expect(label()).toBe('2026 年 11 月')
  })
})
