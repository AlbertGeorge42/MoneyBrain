import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Transactions from '../../../src/pages/Transactions'

vi.mock('../../../src/styles/ThemeContext', () => ({
  useTheme: vi.fn(() => ({ mode: 'light', theme: 'light', setThemeMode: vi.fn() })),
}))

vi.mock('../../../src/queries/transaction', () => ({
  useTransactions: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: true,
    error: new Error('数据库不可用'),
    refetch: vi.fn(),
  })),
  useTransactionStats: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: true,
    error: new Error('数据库不可用'),
    refetch: vi.fn(),
  })),
  useTransactionEarliestDate: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
  useTransactionRefundableList: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
  useCreateTransaction: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateTransaction: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteTransaction: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}))

vi.mock('../../../src/queries/account', () => ({
  useAccounts: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
  useAccountCategories: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

vi.mock('../../../src/queries/category', () => ({
  useTransactionCategories: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

const renderTransactions = () =>
  render(
    <MemoryRouter>
      <Transactions />
    </MemoryRouter>
  )

describe('Transactions Page 错误态', () => {
  it('列表加载失败时应该展示错误与原因，而不是空列表', () => {
    renderTransactions()

    expect(screen.getByText('交易列表加载失败')).toBeInTheDocument()
    // 列表与统计都失败，因此原因文案出现两次
    expect(screen.getAllByText('数据库不可用').length).toBeGreaterThan(0)
    expect(screen.queryByText('暂无交易记录')).not.toBeInTheDocument()
  })

  it('统计加载失败时不应该把金额显示成 0', () => {
    renderTransactions()

    expect(screen.getByText('交易统计加载失败')).toBeInTheDocument()
    expect(screen.queryByText('总收入')).not.toBeInTheDocument()
    expect(screen.queryByText('总支出')).not.toBeInTheDocument()
  })

  it('错误态应该提供重试入口', () => {
    renderTransactions()

    expect(screen.getAllByRole('button', { name: /重\s*试/ }).length).toBeGreaterThan(0)
  })
})
