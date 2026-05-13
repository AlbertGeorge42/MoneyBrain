import React, { useEffect, useState } from 'react'
import { Button, Card, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { Transaction } from '../services/api'
import { toDateRangeParams } from '../utils/timePicker'
import { PageHeader } from '../components/common'
import {
  TransactionFilter,
  TransactionStats,
  TransactionTable,
  FloatingActionButton,
  TransactionFilterValues,
  TransactionCreate,
  TransactionEdit,
} from '../components/transactions'

const MOBILE_BREAKPOINT = 860

const Transactions: React.FC = () => {
  const {
    transactions,
    accounts,
    transactionCategories,
    accountCategories,
    loading,
    pagination,
    stats,
    fetchTransactions,
    fetchAccounts,
    fetchTransactionCategories,
    fetchAccountCategories,
    fetchTransactionStats,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  } = useStore()

  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [filterExpanded, setFilterExpanded] = useState(false)
  const [filters, setFilters] = useState<TransactionFilterValues>({
    type: [],
    accountId: [],
    categoryId: [],
    dateRange: null,
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    fetchTransactions()
    fetchAccounts()
    fetchTransactionCategories()
    fetchAccountCategories()
    fetchTransactionStats()
  }, [])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleAdd = () => {
    setCreateModalVisible(true)
  }

  const handleRowClick = (record: Transaction) => {
    setSelectedTransaction(record)
    setEditModalVisible(true)
  }

  const handleCreateSubmit = async (values: unknown) => {
    await addTransaction(values as Record<string, unknown>)
    message.success('创建成功')
    setCreateModalVisible(false)
  }

  const handleEditSubmit = async (values: unknown) => {
    if (!selectedTransaction) return
    await updateTransaction(selectedTransaction.id, values as Partial<Transaction>)
    message.success('更新成功')
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
    await addTransaction(data)
    message.success('退款记录成功')
  }

  const handleDelete = async () => {
    if (!selectedTransaction) return
    await deleteTransaction(selectedTransaction.id)
    message.success('删除成功')
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
    fetchTransactions(params)
    fetchTransactionStats(params)
    setCurrentPage(1)
  }

  const handleReset = () => {
    setFilters({
      type: [],
      accountId: [],
      categoryId: [],
      dateRange: null,
    })
    fetchTransactions({ page: 1, pageSize })
    fetchTransactionStats()
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
    fetchTransactions(params)
  }

  const renderAddButton = () => {
    if (isMobile) {
      return null
    }
    return (
      <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
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

      <Card>
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

      <TransactionStats
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

      {isMobile && <FloatingActionButton onClick={handleAdd} />}

      <TransactionCreate
        visible={createModalVisible}
        accounts={accounts}
        categories={transactionCategories}
        initialType="expense"
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
