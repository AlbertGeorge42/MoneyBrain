/**
 * 空账本预算页主操作收敛（K7）
 *
 * 原缺陷：页头「新增」与空态「新增预算条目」并列，两个主按钮抢注意力。
 * 断言：空态下页面级主按钮只保留空态里的一个，页头新增入口不出现。
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { BudgetPage } from '@/features/budgets/BudgetPage'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { createSeedLedger } from '@/dev-fixtures/seed'

describe('K7 空账本主操作', () => {
  it('页头不再出现「新增」，页面级主按钮只剩空态里的一个', () => {
    const { container } = render(
      <MantineProvider>
        <LedgerProvider initialLedger={{ ...createSeedLedger(), budgets: [] }} dataMode="seed">
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

    const primaries = Array.from(container.querySelectorAll('.mb-primary-btn')).map(
      (node) => node.textContent?.trim(),
    )
    expect(primaries).toEqual(['新增预算条目'])
    expect(container.querySelector('.mb-bg-add')).toBeNull()
    expect(screen.queryByRole('button', { name: '新增' })).toBeNull()
  })
})
