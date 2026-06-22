import React, { useState } from 'react'
import { Button, Card, theme } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { Transaction } from '../services/api'
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
  TransactionEdit,
  TransactionFormType,
} from '../components/transactions'

const Transactions: React.FC = () => {
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [filterExpanded, setFilterExpanded] = useState(false)
  const [initialType, setInitialType] = useState<TransactionFormType>('expense')
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

  const handleAdd = (type: TransactionFormType = 'expense') => {
    setInitialType(type)
    setCreateModalVisible(true)
  }

  const handleRowClick = (record: Transaction) => {
    setSelectedTransaction(record)
    setEditModalVisible(true)
  }

  const handleCreateSubmit = async (values: unknown) => {
    await createTransaction.mutateAsync(values as Record<string, unknown>)
    notify.success('创建成功')
    setCreateModalVisible(false)
  }

  const handleEditSubmit = async (values: unknown) => {
    if (!selectedTransaction) return
    await updateTransaction.mutateAsync({ id: selectedTransaction.id, data: values as Partial<Transaction> })
    notify.success('更新成功')
  }

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
  }

  const handleDelete = async () => {
    if (!selectedTransaction) return
    await deleteTransaction.mutateAsync(selectedTransaction.id)
    notify.success('删除成功')
  }

  const handleSearch = () => {
    const params: Record<string, unknown> = {}
    if (filters.type.length > 0) params.type = filters.type
    if (filters.accountId.length > 0) params.accountId = filters.accountId
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
    if (filters.accountId.length > 0) params.accountId = filters.accountId
    if (filters.categoryId.length > 0) params.categoryId = filters.categoryId
    if (filters.dateRange) {
      Object.assign(params, toDateRangeParams(filters.dateRange))
    }
    setQueryParams(params)
  }

  const renderAddButton = () => {
    if (isMobile) {
      return null
    }

    return (
      <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd('expense')}>
        记一笔
      </Button>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Transactions"
        title="交易记录"
        description="录入、筛选与修正。"
        actions={<>{renderAddButton()}</>}
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

      <TransactionCreate
        visible={createModalVisible}
        accounts={accounts}
        categories={transactionCategories}
        initialType={initialType}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
      />

      <TransactionEdit
        visible={editModalVisible}
        transaction={selectedTransaction}
        accounts={accounts}
        categories={transactionCategories}
        onEdit={handleEditSubmit}
        onRefund={handleRefundSubmit}
        onDelete={handleDelete}
        onCancel={() => setEditModalVisible(false)}
      />
    </div>
  )
}

export default Transactions
