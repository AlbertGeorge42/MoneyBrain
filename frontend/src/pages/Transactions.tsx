import React, { useState } from 'react'
import { Button, Card, theme } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { Transaction, TransactionType } from '../services/api'
import type { Account, AccountCategory } from '../services/api'
import { toDateRangeParams } from '../utils/timePicker'
import { PageHeader } from '../components/common'
import { useIsMobile } from '../hooks/useIsMobile'
import { useNotify } from '../hooks/useNotify'
import {
  useTransactions,
  useTransactionStats,
  useAccounts,
  useTransactionCategories,
  useAccountCategories,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
} from '../queries'
import {
  TransactionFilter,
  TransactionStats as TransactionStatsComponent,
  TransactionTable,
  FloatingActionButton,
  TransactionFilterValues,
  TransactionCreate,
} from '../components/transactions'
import TransactionDetail, { TransactionDetailFooter } from '../components/transactions/TransactionDetail'
import TransactionEdit from '../components/transactions/TransactionEdit'
import type { TransactionEditMode } from '../components/transactions/TransactionEdit'
import ResponsiveDrawer from '../components/common/ResponsiveDrawer'

const Transactions: React.FC = () => {
  // 新建状态
  const [createVisible, setCreateVisible] = useState(false)
  const [initialType, setInitialType] = useState<TransactionType>('expense')

  // 详情/编辑状态
  const [detailVisible, setDetailVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [editMode, setEditMode] = useState<TransactionEditMode>('edit')
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)

  // 筛选状态
  const [filterExpanded, setFilterExpanded] = useState(false)
  const [filters, setFilters] = useState<TransactionFilterValues>({
    type: [],
    accountId: [],
    categoryId: [],
    dateRange: null,
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const { token } = theme.useToken()
  const isMobile = useIsMobile()
  const notify = useNotify()

  const [queryParams, setQueryParams] = useState<Record<string, unknown>>({
    page: 1,
    pageSize: 20,
  })

  const { data: transactionsData, isLoading: loading } = useTransactions(queryParams)
  const transactions = transactionsData?.list ?? []
  const pagination = {
    total: transactionsData?.total ?? 0,
    page: transactionsData?.page ?? 1,
    pageSize: transactionsData?.pageSize ?? 20,
  }

  const { data: stats = { income: 0, expense: 0, refund: 0, balance: 0, transferCount: 0 } } = useTransactionStats(queryParams)
  const { data: accounts = [] } = useAccounts()
  const { data: transactionCategories = [] } = useTransactionCategories()
  const { data: accountCategories = [] } = useAccountCategories()

  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const deleteTransaction = useDeleteTransaction()

  // 打开新建弹窗
  const handleAdd = (type: TransactionType = 'expense') => {
    setInitialType(type)
    setCreateVisible(true)
  }

  // 点击交易行 → 打开详情抽屉
  const handleRowClick = (record: Transaction) => {
    setSelectedTransaction(record)
    setDetailVisible(true)
    setEditVisible(false)
  }

  // 从详情切换到编辑
  const handleEditFromDetail = () => {
    setDetailVisible(false)
    setEditVisible(true)
    setEditMode('edit')
  }

  // 从详情发起退款
  const handleRefundFromDetail = () => {
    setDetailVisible(false)
    setEditVisible(true)
    setEditMode('refund')
  }

  // 从编辑返回详情
  const handleBackToDetail = () => {
    setEditVisible(false)
    setDetailVisible(true)
  }

  // 关闭所有抽屉
  const handleCloseAll = () => {
    setDetailVisible(false)
    setEditVisible(false)
    setSelectedTransaction(null)
  }

  // 新建提交
  const handleCreateSubmit = async (values: unknown) => {
    await createTransaction.mutateAsync(values as Record<string, unknown>)
    notify.success('创建成功')
    setCreateVisible(false)
  }

  // 编辑提交
  const handleEditSubmit = async (values: unknown) => {
    if (!selectedTransaction) return
    await updateTransaction.mutateAsync({ id: selectedTransaction.id, data: values as Partial<Transaction> })
    notify.success('更新成功')
    handleCloseAll()
  }

  // 退款提交
  const handleRefundSubmit = async (values: unknown) => {
    if (!selectedTransaction) return
    const data = {
      type: 'refund' as const,
      amount: (values as { amount: number }).amount,
      fee: (values as { fee?: number }).fee || 0,
      coupon: (values as { coupon?: number }).coupon || 0,
      date: (values as { date: string }).date,
      accountId: (values as { accountId: string }).accountId,
      relatedTransactionId: selectedTransaction.id,
      note: (values as { note?: string }).note,
    }
    await createTransaction.mutateAsync(data)
    notify.success('退款记录成功')
    handleCloseAll()
  }

  // 删除确认
  const handleDelete = async () => {
    if (!selectedTransaction) return
    await deleteTransaction.mutateAsync(selectedTransaction.id)
    notify.success('删除成功')
    handleCloseAll()
  }

  // 筛选相关
  // 将 accountId 中的虚拟根节点展开为具体账户 ID
  const resolveAccountFilters = (ids: string[], accts: Account[], cats: AccountCategory[]): string[] => {
    const result: string[] = []
    for (const id of ids) {
      if (id === 'asset_root') {
        const catIds = cats.filter(c => c.type === 'asset').map(c => c.id)
        result.push(...accts.filter(a => a.categoryId && catIds.includes(a.categoryId)).map(a => a.id))
      } else if (id === 'liability_root') {
        const catIds = cats.filter(c => c.type === 'liability').map(c => c.id)
        result.push(...accts.filter(a => a.categoryId && catIds.includes(a.categoryId)).map(a => a.id))
      } else {
        result.push(id)
      }
    }
    // 当前 cascade 行为同时保留了子节点 ID 和根节点值，去重避免重复
    return [...new Set(result)]
  }

  const handleSearch = () => {
    const params: Record<string, unknown> = {}
    if (filters.type.length > 0) params.type = filters.type
    if (filters.accountId.length > 0) {
      params.accountId = resolveAccountFilters(filters.accountId, accounts, accountCategories)
    }
    if (filters.categoryId.length > 0) params.categoryId = filters.categoryId
    if (filters.dateRange) {
      Object.assign(params, toDateRangeParams(filters.dateRange))
    }
    params.page = 1
    params.pageSize = pageSize
    setQueryParams(params)
    setCurrentPage(1)
  }

  const handleReset = () => {
    setFilters({
      type: [],
      accountId: [],
      categoryId: [],
      dateRange: null,
    })
    setQueryParams({ page: 1, pageSize })
    setCurrentPage(1)
  }

  const handlePageChange = (newPage: number, newPageSize: number) => {
    setCurrentPage(newPage)
    setPageSize(newPageSize)
    const params: Record<string, unknown> = { page: newPage, pageSize: newPageSize }
    if (filters.type.length > 0) params.type = filters.type
    if (filters.accountId.length > 0) {
      params.accountId = resolveAccountFilters(filters.accountId, accounts, accountCategories)
    }
    if (filters.categoryId.length > 0) params.categoryId = filters.categoryId
    if (filters.dateRange) {
      Object.assign(params, toDateRangeParams(filters.dateRange))
    }
    setQueryParams(params)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Transactions"
        title="交易记录"
        description="录入、筛选与修正。"
        actions={
          !isMobile ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd('expense')}>
              记一笔
            </Button>
          ) : undefined
        }
      />

      <Card style={{ marginBottom: `${token.padding}px` }}>
        <TransactionFilter
          accounts={accounts}
          categories={transactionCategories}
          accountCategories={accountCategories}
          filters={filters}
          filterExpanded={filterExpanded}
          onFilterChange={setFilters}
          onFilterExpandedChange={setFilterExpanded}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      </Card>

      <TransactionStatsComponent
        totalIncome={stats.income}
        totalExpense={stats.expense}
        totalRefund={stats.refund}
        balance={stats.balance}
        transferCount={stats.transferCount}
      />

      <TransactionTable
        transactions={transactions}
        loading={loading}
        currentPage={currentPage}
        pageSize={pageSize}
        total={pagination.total}
        onPageChange={handlePageChange}
        onRowClick={handleRowClick}
      />

      {isMobile && <FloatingActionButton onClick={() => handleAdd('expense')} />}

      {/* 新建抽屉 */}
      <TransactionCreate
        visible={createVisible}
        accounts={accounts}
        categories={transactionCategories}
        initialType={initialType}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateVisible(false)}
      />

      {/* 详情抽屉 */}
      {selectedTransaction && (
        <ResponsiveDrawer
          visible={detailVisible}
          title="交易详情"
          onCancel={handleCloseAll}
          footer={
            <TransactionDetailFooter
              transactionType={selectedTransaction.type}
              onEdit={handleEditFromDetail}
              onRefund={handleRefundFromDetail}
              onDelete={handleDelete}
              isDeleting={deleteTransaction.isPending}
            />
          }
        >
          <TransactionDetail
            transaction={selectedTransaction}
          />
        </ResponsiveDrawer>
      )}

      {/* 编辑抽屉 */}
      <TransactionEdit
        visible={editVisible}
        transaction={selectedTransaction}
        accounts={accounts}
        categories={transactionCategories}
        onEdit={handleEditSubmit}
        onRefund={handleRefundSubmit}
        onCancel={handleCloseAll}
        onBack={handleBackToDetail}
        mode={editMode}
      />
    </div>
  )
}

export default Transactions