import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Settings from '../../../src/pages/Settings'

vi.mock('../../../src/styles/ThemeContext', () => ({
  useTheme: vi.fn(() => ({ mode: 'light', theme: 'light', setThemeMode: vi.fn() })),
}))

vi.mock('../../../src/queries/account', () => ({
  useAccounts: vi.fn(() => ({ data: [{ id: '1', name: '现金' }], isLoading: false })),
  useAccountCategories: vi.fn(() => ({ data: [{ id: '1', name: '资产' }], isLoading: false })),
}))

vi.mock('../../../src/queries/category', () => ({
  useTransactionCategories: vi.fn(() => ({ data: [{ id: '1', name: '餐饮' }], isLoading: false })),
}))

vi.mock('../../../src/queries/transaction', () => ({
  useTransactions: vi.fn(() => ({ data: { list: [], total: 150, page: 1, pageSize: 20 }, isLoading: false })),
}))

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

  it('应该显示正确的总交易数（pagination.total）', async () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('150')).toBeInTheDocument()
  })

  it('应该显示账户数量', () => {
    renderWithQueryClient(<Settings />)
    expect(screen.getByText('账户')).toBeInTheDocument()
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

  it('应该显示导出选项 checkboxes 和快速选择按钮', async () => {
    const view = renderWithQueryClient(<Settings />)
    // 展开 Collapse 面板以显示内部内容
    const collapseHeader = view.container.querySelector('.ant-collapse-header')
    expect(collapseHeader).not.toBeNull()
    fireEvent.click(collapseHeader!)
    // 4 个 Checkbox 标签：交易记录、配置信息、预算配置、投资快照
    await waitFor(() => {
      expect(screen.getByText('配置信息（账户、分类）')).toBeInTheDocument()
    })
    expect(screen.getByText('预算配置')).toBeInTheDocument()
    expect(screen.getByText('投资快照')).toBeInTheDocument()
    // 快速选择按钮
    const quickButtons = view.container.querySelectorAll('.ant-btn-sm')
    expect(quickButtons.length).toBeGreaterThanOrEqual(3)
    const quickTexts = Array.from(quickButtons).map(b => b.textContent?.replace(/\s/g, ''))
    expect(quickTexts).toContain('全选')
    expect(quickTexts).toContain('仅配置')
    expect(quickTexts).toContain('仅数据')
  })

  it('应该只显示一个导出按钮', () => {
    renderWithQueryClient(<Settings />)
    const exportButtons = screen.getAllByRole('button', { name: /导出/ })
    expect(exportButtons.length).toBe(1)
  })
})
