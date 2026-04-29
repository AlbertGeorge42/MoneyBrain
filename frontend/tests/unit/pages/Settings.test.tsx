import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Settings from '../../../src/pages/Settings'

vi.mock('../../../src/stores', () => ({
  useStore: vi.fn(),
}))

vi.mock('../../../src/styles/ThemeContext', () => ({
  useTheme: vi.fn(() => ({ mode: 'light', theme: 'light', setThemeMode: vi.fn() })),
}))

import { useStore } from '../../../src/stores'

const mockUseStore = useStore as ReturnType<typeof vi.fn>

describe('Settings Page', () => {
  const mockFetchTransactions = vi.fn()
  const mockFetchAccounts = vi.fn()
  const mockFetchTransactionCategories = vi.fn()
  const mockFetchAccountCategories = vi.fn()
  const mockFetchBudgets = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseStore.mockReturnValue({
      accounts: [{ id: '1', name: '现金' }],
      transactions: [],
      transactionCategories: [{ id: '1', name: '餐饮' }],
      accountCategories: [{ id: '1', name: '资产' }],
      pagination: { total: 150, page: 1, pageSize: 20 },
      loading: false,
      fetchTransactions: mockFetchTransactions,
      fetchAccounts: mockFetchAccounts,
      fetchTransactionCategories: mockFetchTransactionCategories,
      fetchAccountCategories: mockFetchAccountCategories,
      fetchBudgets: mockFetchBudgets,
    })
  })

  it('应该显示正确的总交易数（pagination.total）', async () => {
    render(<Settings />)
    
    await waitFor(() => {
      expect(mockFetchTransactions).toHaveBeenCalledWith({ pageSize: 1 })
      expect(mockFetchAccounts).toHaveBeenCalled()
      expect(mockFetchTransactionCategories).toHaveBeenCalled()
      expect(mockFetchAccountCategories).toHaveBeenCalled()
    })
    
    expect(screen.getByText('150')).toBeInTheDocument()
  })

  it('应该显示账户数量', () => {
    render(<Settings />)
    expect(screen.getByText('账户')).toBeInTheDocument()
  })

  it('应该显示收支分类数量', () => {
    render(<Settings />)
    expect(screen.getByText('收支分类')).toBeInTheDocument()
  })

  it('应该显示账户分类数量', () => {
    render(<Settings />)
    expect(screen.getByText('账户分类')).toBeInTheDocument()
  })

  it('应该显示主题选择区域', () => {
    render(<Settings />)
    expect(screen.getByText('外观主题')).toBeInTheDocument()
  })

  it('应该显示数据备份区域', () => {
    render(<Settings />)
    expect(screen.getByText('数据备份')).toBeInTheDocument()
  })

  it('应该显示危险操作区域', () => {
    render(<Settings />)
    expect(screen.getByText('危险操作')).toBeInTheDocument()
  })

  it('应该显示主题选项', () => {
    render(<Settings />)
    expect(screen.getByText('浅色')).toBeInTheDocument()
    expect(screen.getByText('深色')).toBeInTheDocument()
    expect(screen.getByText('跟随系统')).toBeInTheDocument()
  })

  it('应该显示数据备份 Tabs', () => {
    render(<Settings />)
    const tabs = screen.getAllByText('交易记录')
    expect(tabs.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('配置信息')).toBeInTheDocument()
  })
})
