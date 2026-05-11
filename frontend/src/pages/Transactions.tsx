import React, { useEffect, useState } from 'react'
import { Button, Card, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { Transaction } from '../services/api'
import { toDateRangeParams } from '../utils/timePicker'
import { PageHeader } from '../components/common'
import {
  TransactionDrawer,
  TransactionFilter,
  TransactionStats,
  TransactionTable,
  RefundModal,
  FloatingActionButton,
  TransactionFilterValues,
} from '../components/transactions'
import { spaceMd } from '../styles/tokens'
import { TransactionFormType } from '../components/transactions/TransactionForm'

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

  const [drawerVisible, setDrawerVisible] = useState(false)
  const [refundModalVisible, setRefundModalVisible] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [initialType, setInitialType] = useState<TransactionFormType>('expense')
  const [filterExpanded, setFilterExpanded] = useState(false)
  const [filters, setFilters] = useState<TransactionFilterValues>({
    type: [],
    accountId: [],
    categoryId: [],
    dateRange: null,
  })
  const [refundSourceTransaction, setRefundSourceTransaction] = useState<Transaction | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    fetchTransactions()
    fetchAccounts()
    fetchTransactionCategories()
    fetchAccountCategories()
    fetchTransactionStats()
  }, [])

  const handleAdd = (type?: TransactionFormType) => {
    setEditingTransaction(null)
    setInitialType(type || 'expense')
    setDrawerVisible(true)
  }

  const handleRefundFromTable = (record: Transaction) => {
    setRefundSourceTransaction(record)
    setRefundModalVisible(true)
  }

  const handleEdit = (record: Transaction) => {
    setEditingTransaction(record)
    if (record.type === 'transfer' || record.type === 'refund' || record.type === 'adjustment') {
      if (record.type === 'refund') {
        setRefundSourceTransaction(record)
        setRefundModalVisible(true)
      }
    } else {
      setInitialType(record.type as TransactionFormType)
      setDrawerVisible(true)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id)
      message.success('删除成功')
    } catch {
      message.error('删除失败')
    }
  }

  const handleDrawerSubmit = async (values: unknown) => {
    if (editingTransaction) {
      await updateTransaction(editingTransaction.id, values as Partial<Transaction>)
      message.success('更新成功')
    } else {
      await addTransaction(values as Record<string, unknown>)
      message.success('创建成功')
    }
    setDrawerVisible(false)
  }

  const handleRefundSubmit = async (values: unknown) => {
    const data = {
      type: 'refund',
      amount: (values as { amount: number }).amount,
      fee: (values as { fee?: number }).fee || 0,
      coupon: (values as { coupon?: number }).coupon || 0,
      date: (values as { date: { format: (fmt: string) => string } }).date.format('YYYY-MM-DD'),
      accountId: (values as { accountId: string }).accountId,
      relatedTransactionId: refundSourceTransaction?.id,
      note: (values as { note?: string }).note,
    }
    if (editingTransaction) {
      await updateTransaction(editingTransaction.id, data)
      message.success('更新成功')
    } else {
      await addTransaction(data)
      message.success('退款记录成功')
    }
    setRefundModalVisible(false)
    setRefundSourceTransaction(null)
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
      <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd()}>
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

      <Card style={{ marginBottom: spaceMd }}>
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
        onEdit={handleEdit}
        onDelete={handleDelete}
        onPageChange={handlePageChange}
        onRefund={handleRefundFromTable}
      />

      {isMobile && <FloatingActionButton onClick={() => handleAdd()} />}

      <TransactionDrawer
        visible={drawerVisible}
        title={editingTransaction ? '编辑记录' : '新增记录'}
        editingTransaction={editingTransaction}
        accounts={accounts}
        categories={transactionCategories}
        initialType={initialType}
        onOk={handleDrawerSubmit}
        onCancel={() => setDrawerVisible(false)}
      />

      <RefundModal
        visible={refundModalVisible}
        editingTransaction={editingTransaction}
        accounts={accounts}
        sourceTransaction={refundSourceTransaction}
        onOk={handleRefundSubmit}
        onCancel={() => {
          setRefundModalVisible(false)
          setRefundSourceTransaction(null)
        }}
      />
    </div>
  )
}

export default Transactions
