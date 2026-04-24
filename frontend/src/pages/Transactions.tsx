import React, { useEffect, useState } from 'react'
import { Button, Card, message } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, RollbackOutlined, SwapOutlined } from '@ant-design/icons'
import { PageHeader } from '../components/common'
import {
  RefundFormValues,
  RefundModal,
  TransactionFilter,
  TransactionFilterValues,
  TransactionFormValues,
  TransactionModal,
  TransactionStats,
  TransactionTable,
  TransferFormValues,
  TransferModal,
} from '../components/transactions'
import { Transaction, transactionApi } from '../services/api'
import { useStore } from '../stores'
import { colorWarning } from '../styles/tokens'
import { toDateRangeParams } from '../utils/timePicker'

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

  const [modalVisible, setModalVisible] = useState(false)
  const [transferModalVisible, setTransferModalVisible] = useState(false)
  const [refundModalVisible, setRefundModalVisible] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [initialType, setInitialType] = useState<'income' | 'expense' | undefined>(undefined)
  const [filterExpanded, setFilterExpanded] = useState(false)
  const [filters, setFilters] = useState<TransactionFilterValues>({
    type: [],
    accountId: [],
    categoryId: [],
    dateRange: null,
  })
  const [refundableTransactions, setRefundableTransactions] = useState<Transaction[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    fetchTransactions()
    fetchAccounts()
    fetchTransactionCategories()
    fetchAccountCategories()
    fetchTransactionStats()
  }, [
    fetchAccountCategories,
    fetchAccounts,
    fetchTransactionCategories,
    fetchTransactionStats,
    fetchTransactions,
  ])

  const handleAdd = (type?: 'income' | 'expense') => {
    setEditingTransaction(null)
    setInitialType(type)
    setModalVisible(true)
  }

  const handleTransfer = () => {
    setEditingTransaction(null)
    setTransferModalVisible(true)
  }

  const handleRefund = async () => {
    setEditingTransaction(null)
    try {
      const res = await transactionApi.getRefundableList()
      setRefundableTransactions(res.data.data || [])
      setRefundModalVisible(true)
    } catch (error) {
      message.error('获取可退款交易列表失败')
    }
  }

  const handleEdit = (record: Transaction) => {
    setEditingTransaction(record)
    if (record.type === 'transfer') {
      setTransferModalVisible(true)
      return
    }

    if (record.type === 'refund') {
      void transactionApi.getRefundableList().then((res) => {
        setRefundableTransactions(res.data.data || [])
        setRefundModalVisible(true)
      })
      return
    }

    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id)
      message.success('删除成功')
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleTransactionSubmit = async (values: TransactionFormValues) => {
    const payload = {
      ...values,
      fee: values.fee || 0,
      coupon: values.coupon || 0,
      date: values.date.format('YYYY-MM-DD'),
    }

    if (editingTransaction) {
      await updateTransaction(editingTransaction.id, payload)
      message.success('更新成功')
    } else {
      await addTransaction(payload)
      message.success('创建成功')
    }

    setModalVisible(false)
  }

  const handleTransferSubmit = async (values: TransferFormValues) => {
    const payload = {
      type: 'transfer' as const,
      amount: values.amount,
      fee: values.fee || 0,
      coupon: values.coupon || 0,
      date: values.date.format('YYYY-MM-DD'),
      accountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      categoryId: values.categoryId,
      note: values.note,
    }

    if (editingTransaction) {
      await updateTransaction(editingTransaction.id, payload)
      message.success('更新成功')
    } else {
      await addTransaction(payload)
      message.success('转账成功')
    }

    setTransferModalVisible(false)
  }

  const handleRefundSubmit = async (values: RefundFormValues) => {
    const payload = {
      type: 'refund' as const,
      amount: values.amount,
      fee: values.fee || 0,
      coupon: values.coupon || 0,
      date: values.date.format('YYYY-MM-DD'),
      accountId: values.accountId,
      relatedTransactionId: values.relatedTransactionId,
      note: values.note,
    }

    if (editingTransaction) {
      await updateTransaction(editingTransaction.id, payload)
      message.success('更新成功')
    } else {
      await addTransaction(payload)
      message.success('退款记录已创建')
    }

    setRefundModalVisible(false)
  }

  const handleSearch = () => {
    const params: Record<string, unknown> = {}
    if (filters.type.length > 0) params.type = filters.type
    if (filters.accountId.length > 0) params.accountId = filters.accountId
    if (filters.categoryId.length > 0) params.categoryId = filters.categoryId
    if (filters.dateRange) Object.assign(params, toDateRangeParams(filters.dateRange))

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

  const handlePageChange = (nextPage: number, nextPageSize: number) => {
    setCurrentPage(nextPage)
    setPageSize(nextPageSize)

    const params: Record<string, unknown> = { page: nextPage, pageSize: nextPageSize }
    if (filters.type.length > 0) params.type = filters.type
    if (filters.accountId.length > 0) params.accountId = filters.accountId
    if (filters.categoryId.length > 0) params.categoryId = filters.categoryId
    if (filters.dateRange) Object.assign(params, toDateRangeParams(filters.dateRange))

    fetchTransactions(params)
  }

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="交易记录"
        description="把日常记账、筛选复盘和交易修正放在同一个工作台里。"
        actions={
          <div className="action-cluster">
            <Button type="primary" icon={<ArrowUpOutlined />} onClick={() => handleAdd('income')}>
              记收入
            </Button>
            <Button danger icon={<ArrowDownOutlined />} onClick={() => handleAdd('expense')}>
              记支出
            </Button>
            <Button icon={<SwapOutlined />} onClick={handleTransfer}>
              记转账
            </Button>
            <Button icon={<RollbackOutlined />} onClick={handleRefund} style={{ borderColor: colorWarning, color: colorWarning }}>
              记退款
            </Button>
          </div>
        }
      />

      <Card className="surface-card">
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

      <Card className="surface-card">
        <TransactionTable
          transactions={transactions}
          loading={loading}
          currentPage={currentPage}
          pageSize={pageSize}
          total={pagination.total}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onPageChange={handlePageChange}
        />
      </Card>

      <TransactionModal
        visible={modalVisible}
        editingTransaction={
          editingTransaction && editingTransaction.type !== 'transfer' && editingTransaction.type !== 'refund'
            ? editingTransaction
            : null
        }
        accounts={accounts}
        categories={transactionCategories}
        initialType={initialType}
        onOk={handleTransactionSubmit}
        onCancel={() => setModalVisible(false)}
      />

      <TransferModal
        visible={transferModalVisible}
        editingTransaction={editingTransaction && editingTransaction.type === 'transfer' ? editingTransaction : null}
        accounts={accounts}
        categories={transactionCategories}
        onOk={handleTransferSubmit}
        onCancel={() => setTransferModalVisible(false)}
      />

      <RefundModal
        visible={refundModalVisible}
        editingTransaction={editingTransaction && editingTransaction.type === 'refund' ? editingTransaction : null}
        accounts={accounts}
        refundableTransactions={refundableTransactions}
        onOk={handleRefundSubmit}
        onCancel={() => setRefundModalVisible(false)}
      />
    </>
  )
}

export default Transactions
