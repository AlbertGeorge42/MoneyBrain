import React, { useEffect, useState } from 'react'
import { Button, Space, Card, message } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, SwapOutlined, RollbackOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { Transaction, transactionApi } from '../services/api'
import { toDateRangeParams } from '../utils/timePicker'
import { 
  TransactionModal, 
  TransferModal, 
  RefundModal,
  TransactionFilter,
  TransactionStats,
  TransactionTable,
  TransactionFormValues,
  TransferFormValues,
  RefundFormValues,
  TransactionFilterValues,
} from '../components/transactions'

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
  }, [])

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
    } catch (error) {
      message.error('获取可退款交易列表失败')
    }
    setRefundModalVisible(true)
  }

  const handleEdit = (record: Transaction) => {
    setEditingTransaction(record)
    if (record.type === 'transfer') {
      setTransferModalVisible(true)
    } else if (record.type === 'refund') {
      transactionApi.getRefundableList().then(res => {
        setRefundableTransactions(res.data.data || [])
        setRefundModalVisible(true)
      })
    } else {
      setModalVisible(true)
    }
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
    const data = {
      ...values,
      fee: values.fee || 0,
      coupon: values.coupon || 0,
      date: values.date.format('YYYY-MM-DD'),
    }
    if (editingTransaction) {
      await updateTransaction(editingTransaction.id, data)
      message.success('更新成功')
    } else {
      await addTransaction(data)
      message.success('创建成功')
    }
    setModalVisible(false)
  }

  const handleTransferSubmit = async (values: TransferFormValues) => {
    const data = {
      type: 'transfer',
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
      await updateTransaction(editingTransaction.id, data)
      message.success('更新成功')
    } else {
      await addTransaction(data)
      message.success('转账成功')
    }
    setTransferModalVisible(false)
  }

  const handleRefundSubmit = async (values: RefundFormValues) => {
    const data = {
      type: 'refund',
      amount: values.amount,
      fee: values.fee || 0,
      coupon: values.coupon || 0,
      date: values.date.format('YYYY-MM-DD'),
      accountId: values.accountId,
      relatedTransactionId: values.relatedTransactionId,
      note: values.note,
    }
    if (editingTransaction) {
      await updateTransaction(editingTransaction.id, data)
      message.success('更新成功')
    } else {
      await addTransaction(data)
      message.success('退款记录成功')
    }
    setRefundModalVisible(false)
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

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>交易记录</h2>
        <Space>
          <Button type="primary" icon={<ArrowUpOutlined />} onClick={() => handleAdd('income')}>
            记收入
          </Button>
          <Button danger icon={<ArrowDownOutlined />} onClick={() => handleAdd('expense')}>
            记支出
          </Button>
          <Button icon={<SwapOutlined />} onClick={handleTransfer}>
            记转账
          </Button>
          <Button style={{ borderColor: '#fa8c16', color: '#fa8c16' }} icon={<RollbackOutlined />} onClick={handleRefund}>
            记退款
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
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
      />

      <TransactionModal
        visible={modalVisible}
        editingTransaction={editingTransaction && editingTransaction.type !== 'transfer' && editingTransaction.type !== 'refund' ? editingTransaction : null}
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
    </div>
  )
}

export default Transactions
