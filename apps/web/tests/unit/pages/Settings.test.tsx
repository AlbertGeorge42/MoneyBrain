import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Settings from '../../../src/pages/Settings'

vi.mock('../../../src/styles/ThemeContext', () => ({
  useTheme: vi.fn(() => ({ mode: 'light', theme: 'light', setThemeMode: vi.fn() })),
}))

vi.mock('../../../src/queries/account', () => {
  // 工厂只执行一次，data 保持稳定引用，避免组件 useEffect 依赖反复触发造成无限渲染
  const accounts = [{ id: '1', name: '现金' }]
  const accountCategories = [{ id: '1', name: '资产' }]
  return {
    useAccounts: vi.fn(() => ({ data: accounts, isLoading: false })),
    useAccountCategories: vi.fn(() => ({ data: accountCategories, isLoading: false })),
    // 以下 hook 由 AccountConfigModal 等在渲染时调用（即使弹窗不可见也会执行 hooks）
    useAccountStats: vi.fn(() => ({ data: { transactionCount: 0 }, isLoading: false })),
    useAccountBalanceAt: vi.fn(() => ({ data: undefined, isLoading: false })),
    useCreateAccount: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useUpdateAccount: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useDeleteAccount: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useUpdateAccountCategoryAssetType: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

vi.mock('../../../src/queries/category', () => {
  const transactionCategories = [{ id: '1', name: '餐饮' }]
  return {
    useTransactionCategories: vi.fn(() => ({ data: transactionCategories, isLoading: false })),
  }
})

vi.mock('../../../src/queries/transaction', () => {
  const transactions = { list: [], total: 150, page: 1, pageSize: 20 }
  return {
    useTransactions: vi.fn(() => ({ data: transactions, isLoading: false })),
  }
})

vi.mock('../../../src/queries/data', () => ({
  useClearTransactions: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useClearAll: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}))

const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
})

const renderWithQueryClient = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('Settings Page', () => {
  afterEach(() => {
    cleanup()
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该显示配置中心入口', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('配置中心')).toBeInTheDocument()
    expect(screen.getByText('现金流分类')).toBeInTheDocument()
    expect(screen.getByText('投资资产类型')).toBeInTheDocument()
  })

  it('应该显示账户分类入口', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('账户分类')).toBeInTheDocument()
  })

  it('应该显示收支分类数量', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('收支分类')).toBeInTheDocument()
  })

  it('应该显示账户分类数量', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('账户分类')).toBeInTheDocument()
  })

  it('应该显示主题选择区域', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('外观主题')).toBeInTheDocument()
  })

  it('应该显示数据备份区域', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('数据备份')).toBeInTheDocument()
  })

  it('应该显示数据导出与数据导入分区', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('数据导出')).toBeInTheDocument()
    expect(screen.getByText('数据导入')).toBeInTheDocument()
  })

  it('应该显示危险操作区域', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('危险操作')).toBeInTheDocument()
  })

  it('应该显示主题选项', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('浅色')).toBeInTheDocument()
    expect(screen.getByText('深色')).toBeInTheDocument()
    expect(screen.getByText('跟随系统')).toBeInTheDocument()
  })

  it('数据导出区域应展示包含项标签与导出按钮', () => {
    renderWithQueryClient(<Settings />)
    // 导出/导入各渲染一组包含项标签
    expect(screen.getAllByText('交易记录').length).toBeGreaterThan(0)
    expect(screen.getAllByText('配置信息').length).toBeGreaterThan(0)
    expect(screen.getAllByText('预算配置').length).toBeGreaterThan(0)
    expect(screen.getAllByText('投资快照').length).toBeGreaterThan(0)
    // 导出按钮
    expect(screen.getAllByRole('button', { name: /导出/ }).length).toBe(1)
  })

  it('应该显示导入模式选项', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('合并')).toBeInTheDocument()
    expect(screen.getByText('覆盖')).toBeInTheDocument()
  })

  it('应该只显示一个导出按钮', () => {
    renderWithQueryClient(<Settings />)
    const exportButtons = screen.getAllByRole('button', { name: /导出/ })
    expect(exportButtons.length).toBe(1)
  })
})
