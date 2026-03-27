import React, { useEffect, useState } from 'react'
import { 
  Table, Button, Space, Card, Tag, Popconfirm, message, Row, Col, Statistic
} from 'antd'
import { EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined, SwapOutlined, RollbackOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useStore } from '../stores'
import { Transaction, transactionApi } from '../services/api'
import { 
  TransactionModal, 
  TransferModal, 
  RefundModal,
  TransactionFilter,
  TransactionFormValues,
  TransferFormValues,
  RefundFormValues,
  TransactionFilterValues,
} from '../components/transactions'

const Transactions: React.FC = () => {
  const { 
    transactions, 
    accounts, 
    categories,
    accountCategories,
    loading, 
    pagination,
    fetchTransactions, 
    fetchAccounts,
    fetchCategories,
    fetchAccountCategories,
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
    fetchCategories()
    fetchAccountCategories()
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
      params.startDate = filters.dateRange[0].format('YYYY-MM-DD')
      params.endDate = filters.dateRange[1].format('YYYY-MM-DD')
    }
    params.page = 1
    params.pageSize = pageSize
    fetchTransactions(params)
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
    setCurrentPage(1)
  }

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalRefund = transactions
    .filter(t => t.type === 'refund')
    .reduce((sum, t) => sum + t.amount, 0)
  const balance = totalIncome - totalExpense + totalRefund
  const transferCount = transactions.filter(t => t.type === 'transfer').length

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => {
        const typeConfig: Record<string, { color: string; text: string }> = {
          income: { color: 'green', text: '收入' },
          expense: { color: 'red', text: '支出' },
          transfer: { color: 'blue', text: '转账' },
          refund: { color: 'orange', text: '退款' },
        }
        const config = typeConfig[type] || { color: 'default', text: type }
        return <Tag color={config.color}>{config.text}</Tag>
      },
    },
    {
      title: '分类',
      key: 'category',
      render: (_: unknown, record: Transaction) => {
        if (record.type === 'transfer') {
          return record.category ? (
            <Tag>{record.category.name}</Tag>
          ) : (
            <Tag>内部转账</Tag>
          )
        }
        if (record.type === 'refund') {
          return (
            <span>
              <Tag>{record.category?.name || '退款'}</Tag>
              {record.relatedTransaction && (
                <span style={{ color: '#999', fontSize: 12 }}> (原: {record.relatedTransaction.category?.name})</span>
              )}
            </span>
          )
        }
        return <Tag>{record.category?.name || '未分类'}</Tag>
      },
    },
    {
      title: '账户',
      key: 'account',
      render: (_: unknown, record: Transaction) => {
        if (record.type === 'transfer') {
          return (
            <span>
              <Tag>{record.account?.name}</Tag>
              <span style={{ margin: '0 4px' }}>→</span>
              <Tag>{record.toAccount?.name}</Tag>
            </span>
          )
        }
        return <Tag>{record.account?.name || '-'}</Tag>
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number, record: Transaction) => {
        const fee = record.fee || 0
        const coupon = record.coupon || 0
        const hasExtra = fee > 0 || coupon > 0
        
        if (record.type === 'transfer') {
          return (
            <span>
              <span style={{ color: '#1890ff', fontWeight: 'bold' }}>¥{amount.toFixed(2)}</span>
              {hasExtra && <span style={{ color: '#999', fontSize: 12 }}> (手续费:¥{fee}, 优惠:¥{coupon})</span>}
            </span>
          )
        }
        if (record.type === 'refund') {
          return (
            <span>
              <span style={{ color: '#fa8c16', fontWeight: 'bold' }}>+¥{amount.toFixed(2)}</span>
              {hasExtra && <span style={{ color: '#999', fontSize: 12 }}> (手续费:¥{fee})</span>}
            </span>
          )
        }
        return (
          <span>
            <span style={{ color: record.type === 'income' ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
              {record.type === 'income' ? '+' : '-'}¥{amount.toFixed(2)}
            </span>
            {hasExtra && <span style={{ color: '#999', fontSize: 12 }}> (手续费:¥{fee}, 优惠:¥{coupon})</span>}
          </span>
        )
      },
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: Transaction) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="确定要删除此记录吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

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
          categories={categories}
          accountCategories={accountCategories}
          filters={filters}
          filterExpanded={filterExpanded}
          onFilterChange={setFilters}
          onFilterExpandedChange={setFilterExpanded}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={5}>
            <Statistic
              title="总收入"
              value={totalIncome}
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              prefix="¥"
            />
          </Col>
          <Col span={5}>
            <Statistic
              title="总支出"
              value={totalExpense}
              precision={2}
              valueStyle={{ color: '#cf1322' }}
              prefix="¥"
            />
          </Col>
          <Col span={4}>
            <Statistic
              title="退款"
              value={totalRefund}
              precision={2}
              valueStyle={{ color: '#fa8c16' }}
              prefix="¥"
            />
          </Col>
          <Col span={5}>
            <Statistic
              title="结余"
              value={balance}
              precision={2}
              valueStyle={{ color: balance >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
          <Col span={5}>
            <Statistic
              title="转账次数"
              value={transferCount}
              suffix="笔"
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table 
          dataSource={transactions} 
          columns={columns} 
          rowKey="id"
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (newPage, newPageSize) => {
              setCurrentPage(newPage)
              setPageSize(newPageSize)
              const params: Record<string, unknown> = { page: newPage, pageSize: newPageSize }
              if (filters.type.length > 0) params.type = filters.type
              if (filters.accountId.length > 0) params.accountId = filters.accountId
              if (filters.categoryId.length > 0) params.categoryId = filters.categoryId
              if (filters.dateRange) {
                params.startDate = filters.dateRange[0].format('YYYY-MM-DD')
                params.endDate = filters.dateRange[1].format('YYYY-MM-DD')
              }
              fetchTransactions(params)
            }
          }}
          loading={loading}
        />
      </Card>

      <TransactionModal
        visible={modalVisible}
        editingTransaction={editingTransaction && editingTransaction.type !== 'transfer' && editingTransaction.type !== 'refund' ? editingTransaction : null}
        accounts={accounts}
        categories={categories}
        initialType={initialType}
        onOk={handleTransactionSubmit}
        onCancel={() => setModalVisible(false)}
      />

      <TransferModal
        visible={transferModalVisible}
        editingTransaction={editingTransaction && editingTransaction.type === 'transfer' ? editingTransaction : null}
        accounts={accounts}
        categories={categories}
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
