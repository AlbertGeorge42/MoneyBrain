/**
 * P2 #7 / #9 / #13（总览与记账）
 *
 * #7 保存后 6 秒撤销依赖 addTransaction 返回可定位的新记录 id；
 * #9 未来日期独立成组、标签带年份、提示不计入本月；
 * #13 千分位金额不再被判格式有误。
 */
import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { useLedger } from '@/features/overview/ledgerStore'
import { QuickEntry } from '@/features/overview/QuickEntry'
import {
  formatAmountInput,
  normalizeAmountInput,
  toCents,
} from '@/features/overview/amountInput'
import {
  TODAY,
  createSeedLedger,
  deriveOverview,
  groupRecentTransactions,
  type LedgerTransaction,
} from '@/features/overview/model'

function transaction(overrides: Partial<LedgerTransaction>): LedgerTransaction {
  return {
    id: 't1',
    date: TODAY,
    type: 'expense',
    categoryId: 'food',
    note: '测试',
    accountId: 'cmb',
    amount: 2_000,
    ...overrides,
  }
}

describe('#7 保存后的记录级撤销', () => {
  it('addTransaction 返回新记录 id，删除后可用同一 id 撤销', () => {
    const { result } = renderHook(() => useLedger(), {
      wrapper: ({ children }) => (
        <LedgerProvider initialLedger={createSeedLedger()}>{children}</LedgerProvider>
      ),
    })

    let id: string | null = null
    act(() => {
      id = result.current.addTransaction({
        type: 'expense',
        categoryId: 'food',
        accountId: 'cmb',
        amount: 1_234,
        note: '撤销链路测试',
      })
    })

    expect(id).toBe('t14')
    expect(result.current.ledger.transactions.some((item) => item.id === id)).toBe(true)

    act(() => result.current.deleteTransactions([id as string]))
    expect(result.current.ledger.transactions.some((item) => item.id === id)).toBe(false)
  })
})

describe('#9 未来日期分组', () => {
  const groups = groupRecentTransactions(
    [
      transaction({ id: 'future', date: '2027-01-05', amount: 5_000 }),
      transaction({ id: 'today', date: TODAY }),
      transaction({ id: 'past', date: '2026-10-27' }),
    ],
    10,
    TODAY,
  )

  it('未来记录单独成组并排在时间线末尾', () => {
    expect(groups[0].date).toBe(TODAY)
    expect(groups[groups.length - 1].date).toBe('future')
    expect(groups[groups.length - 1].items.map((item) => item.id)).toEqual(['future'])
  })

  it('未来分组只用标签表达，不带说明句', () => {
    const future = groups[groups.length - 1]
    expect(future.label).toContain('未来')
    expect(future.label).toContain('2027年1月5日')
    expect(future).not.toHaveProperty('hint')
  })

  it('过去分组标签也补年份', () => {
    expect(groups[0].label).toContain('2026年10月28日')
    expect(groups[1].label).toContain('2026年10月27日')
  })

  it('总览本月支出不含未来日期（有意行为）', () => {
    const ledger = { ...createSeedLedger(), transactions: [transaction({ id: 'future', date: '2027-01-05', amount: 5_000 })] }
    expect(deriveOverview(ledger).expense).toBe(0)
  })
})

describe('#13 千分位金额输入', () => {
  it('解析前剥离千分位与空格', () => {
    expect(normalizeAmountInput('1,234.56')).toBe('1234.56')
    expect(normalizeAmountInput(' 1 234.56 ')).toBe('1234.56')
    expect(toCents('1,234.56')).toBe(123_456)
  })

  it('全角数字与全角小数点转半角', () => {
    expect(normalizeAmountInput('１２３４')).toBe('1234')
    expect(normalizeAmountInput('１２．５')).toBe('12.5')
    expect(toCents('１２３４')).toBe(123_400)
  })

  it('剥离 ¥ / ￥ / $ 前缀与千分位', () => {
    expect(toCents('¥1,234.56')).toBe(123_456)
    expect(toCents('￥1,234.56')).toBe(123_456)
    expect(toCents('$1,234.56')).toBe(123_456)
    expect(toCents(' ¥ 1,234.56 ')).toBe(123_456)
  })

  it('尾空格、空串、纯符号与负号都返回空', () => {
    expect(normalizeAmountInput('1,234.56   ')).toBe('1234.56')
    expect(toCents('   ')).toBeNull()
    expect(toCents('')).toBeNull()
    expect(toCents('-')).toBeNull()
    expect(toCents('¥')).toBeNull()
  })

  it('失焦时按千分位格式化显示', () => {
    expect(formatAmountInput('1234.56')).toBe('1,234.56')
  })

  it('记账弹层粘贴 1,234.56 不再标红且可保存', () => {
    render(
      <MantineProvider>
        <LedgerProvider initialLedger={createSeedLedger()}>
          <QuickEntry opened device="desktop" onClose={() => {}} onSaved={() => {}} />
        </LedgerProvider>
      </MantineProvider>,
    )

    const input = screen.getByLabelText('金额')
    fireEvent.change(input, { target: { value: '1,234.56' } })
    expect(input.getAttribute('aria-invalid')).toBe('false')

    fireEvent.blur(input)
    expect((input as HTMLInputElement).value).toBe('1,234.56')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('记账弹层粘贴 ¥1,234.56 与全角数字同样可保存', () => {
    render(
      <MantineProvider>
        <LedgerProvider initialLedger={createSeedLedger()}>
          <QuickEntry opened device="desktop" onClose={() => {}} onSaved={() => {}} />
        </LedgerProvider>
      </MantineProvider>,
    )

    const input = screen.getByLabelText('金额')
    fireEvent.change(input, { target: { value: '¥1,234.56' } })
    expect((input as HTMLInputElement).value).toBe('1234.56')
    expect(input.getAttribute('aria-invalid')).toBe('false')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()

    fireEvent.change(input, { target: { value: '１２３４' } })
    expect((input as HTMLInputElement).value).toBe('1234')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })
})
