import React, { useEffect, useState } from 'react'
import { 
  Table, Button, Modal, Form, Input, Select, InputNumber, DatePicker, 
  Space, Card, Tag, Popconfirm, message, Row, Col, Statistic, TreeSelect
} from 'antd'
import { EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined, SwapOutlined, RollbackOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useStore } from '../stores'
import { Transaction, transactionApi } from '../services/api'
import { buildTreeData } from '../utils/treeUtils'
import DynamicIcon from '../components/DynamicIcon'
import { formatBalance } from '../utils/formatBalance'

const { RangePicker } = DatePicker

const Transactions: React.FC = () => {
  const { 
    transactions, 
    accounts, 
    categories,
    loading, 
    pagination,
    fetchTransactions, 
    fetchAccounts,
    fetchCategories,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  } = useStore()

  const [modalVisible, setModalVisible] = useState(false)
  const [transferModalVisible, setTransferModalVisible] = useState(false)
  const [refundModalVisible, setRefundModalVisible] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [form] = Form.useForm()
  const [transferForm] = Form.useForm()
  const [refundForm] = Form.useForm()
  const [filters, setFilters] = useState({
    type: undefined as string | undefined,
    accountId: undefined as string | undefined,
    categoryId: undefined as string | undefined,
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
  })
  const [refundableTransactions, setRefundableTransactions] = useState<Transaction[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    fetchTransactions()
    fetchAccounts()
    fetchCategories()
  }, [])

  const getTypeCategories = (type: string) => {
    const filtered = categories.filter(c => c.type === type)
    return buildTreeData(filtered)
  }

  const handleAdd = (type?: string) => {
    setEditingTransaction(null)
    form.resetFields()
    if (type) {
      form.setFieldsValue({ type })
    }
    setModalVisible(true)
  }

  const handleTransfer = () => {
    setEditingTransaction(null)
    transferForm.resetFields()
    setTransferModalVisible(true)
  }

  const handleRefund = async () => {
    setEditingTransaction(null)
    refundForm.resetFields()
    // 获取可退款的交易列表
    try {
      const res = await transactionApi.getRefundableList()
      setRefundableTransactions(res.data.data || [])
    } catch (error) {
      message.error('获取可退款交易列表失败')
    }
    setRefundModalVisible(true)
  }

  const handleEdit = (record: Transaction) => {
    if (record.type === 'transfer') {
      transferForm.setFieldsValue({
        amount: record.amount,
        fee: record.fee || 0,
        coupon: record.coupon || 0,
        date: dayjs(record.date),
        fromAccountId: record.accountId,
        toAccountId: record.toAccountId,
        categoryId: record.categoryId,
        note: record.note,
      })
      setEditingTransaction(record)
      setTransferModalVisible(true)
    } else if (record.type === 'refund') {
      refundForm.setFieldsValue({
        amount: record.amount,
        fee: record.fee || 0,
        coupon: record.coupon || 0,
        date: dayjs(record.date),
        accountId: record.accountId,
        relatedTransactionId: record.relatedTransactionId,
        note: record.note,
      })
      setEditingTransaction(record)
      // 获取可退款的交易列表
      transactionApi.getRefundableList().then(res => {
        setRefundableTransactions(res.data.data || [])
        setRefundModalVisible(true)
      })
    } else {
      form.setFieldsValue({
        type: record.type,
        amount: record.amount,
        fee: record.fee || 0,
        coupon: record.coupon || 0,
        date: dayjs(record.date),
        accountId: record.accountId,
        categoryId: record.categoryId,
        note: record.note,
      })
      setEditingTransaction(record)
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

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
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
      form.resetFields()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleTransferSubmit = async () => {
    try {
      const values = await transferForm.validateFields()
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
      transferForm.resetFields()
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '操作失败')
    }
  }

  const handleRefundSubmit = async () => {
    try {
      const values = await refundForm.validateFields()
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
      refundForm.resetFields()
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '操作失败')
    }
  }

  const handleSearch = () => {
    const params: Record<string, unknown> = {}
    if (filters.type) params.type = filters.type
    if (filters.accountId) params.accountId = filters.accountId
    if (filters.categoryId) params.categoryId = filters.categoryId
    if (filters.dateRange) {
      params.startDate = filters.dateRange[0].format('YYYY-MM-DD')
      params.endDate = filters.dateRange[1].format('YYYY-MM-DD')
    }
    // 重置到第一页
    params.page = 1
    params.pageSize = pageSize
    fetchTransactions(params)
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
            <span><DynamicIcon name={record.category.icon} size={16} /> {record.category.name}</span>
          ) : (
            <span style={{ color: '#999' }}>内部转账</span>
          )
        }
        if (record.type === 'refund') {
          return (
            <span>
              <DynamicIcon name={record.category?.icon} size={16} /> {record.category?.name || '退款'}
              {record.relatedTransaction && (
                <span style={{ color: '#999', fontSize: 12 }}> (原: {record.relatedTransaction.category?.name})</span>
              )}
            </span>
          )
        }
        return <span><DynamicIcon name={record.category?.icon} size={16} /> {record.category?.name || '未分类'}</span>
      },
    },
    {
      title: '账户',
      key: 'account',
      render: (_: unknown, record: Transaction) => {
        if (record.type === 'transfer') {
          return (
            <span>
              <DynamicIcon name={record.account?.icon} size={16} /> {record.account?.name} → <DynamicIcon name={record.toAccount?.icon} size={16} /> {record.toAccount?.name}
            </span>
          )
        }
        return <span><DynamicIcon name={record.account?.icon} size={16} /> {record.account?.name || '-'}</span>
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
        <Row gutter={16}>
          <Col span={6}>
            <Select
              placeholder="选择类型"
              allowClear
              style={{ width: '100%' }}
              value={filters.type}
              onChange={type => setFilters({ ...filters, type })}
            >
              <Select.Option value="income">收入</Select.Option>
              <Select.Option value="expense">支出</Select.Option>
              <Select.Option value="transfer">转账</Select.Option>
              <Select.Option value="refund">退款</Select.Option>
            </Select>
          </Col>
          <Col span={6}>
            <Select
              placeholder="选择账户"
              allowClear
              style={{ width: '100%' }}
              value={filters.accountId}
              onChange={accountId => setFilters({ ...filters, accountId })}
            >
              {accounts.map(a => (
                <Select.Option key={a.id} value={a.id}><DynamicIcon name={a.icon} size={16} /> {a.name}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={filters.dateRange}
              onChange={dates => setFilters({ ...filters, dateRange: dates as [dayjs.Dayjs, dayjs.Dayjs] | null })}
            />
          </Col>
          <Col span={6}>
            <Button type="primary" onClick={handleSearch}>查询</Button>
          </Col>
        </Row>
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
              if (filters.type) params.type = filters.type
              if (filters.accountId) params.accountId = filters.accountId
              if (filters.categoryId) params.categoryId = filters.categoryId
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

      {/* 收支记录弹窗 */}
      <Modal
        title={editingTransaction ? '编辑记录' : '新增记录'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select placeholder="请选择类型">
              <Select.Option value="income">收入</Select.Option>
              <Select.Option value="expense">支出</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="amount"
            label="金额"
            rules={[{ required: true, message: '请输入金额' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              min={0}
              placeholder="请输入金额"
              prefix="¥"
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="fee"
                label="手续费"
                initialValue={0}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="手续费"
                  prefix="¥"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="coupon"
                label="优惠券"
                initialValue={0}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="优惠券"
                  prefix="¥"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="date"
            label="日期"
            rules={[{ required: true, message: '请选择日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}
          >
            {({ getFieldValue }) => {
              const type = getFieldValue('type')
              return (
                <Form.Item
                  name="categoryId"
                  label="分类"
                  rules={[{ required: true, message: '请选择分类' }]}
                >
                  <TreeSelect
                    placeholder="请选择分类"
                    treeData={getTypeCategories(type)}
                    fieldNames={{ label: 'name', value: 'id', children: 'children' }}
                  />
                </Form.Item>
              )
            }}
          </Form.Item>
          <Form.Item
            name="accountId"
            label="账户"
            rules={[{ required: true, message: '请选择账户' }]}
          >
            <Select placeholder="请选择账户">
              {accounts.map(a => (
                <Select.Option key={a.id} value={a.id}>
                  <DynamicIcon name={a.icon} size={16} /> {a.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="note"
            label="备注"
          >
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 转账弹窗 */}
      <Modal
        title={editingTransaction ? '编辑转账' : '新增转账'}
        open={transferModalVisible}
        onOk={handleTransferSubmit}
        onCancel={() => setTransferModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={transferForm} layout="vertical">
          <Form.Item
            name="fromAccountId"
            label="转出账户"
            rules={[{ required: true, message: '请选择转出账户' }]}
          >
            <Select placeholder="请选择转出账户">
              {accounts.map(a => {
                const balanceDisplay = formatBalance(a.balance, a.type as 'asset' | 'liability')
                return (
                  <Select.Option key={a.id} value={a.id}>
                    <DynamicIcon name={a.icon} size={16} /> {a.name} ({balanceDisplay.text})
                  </Select.Option>
                )
              })}
            </Select>
          </Form.Item>
          <Form.Item
            name="toAccountId"
            label="转入账户"
            rules={[{ required: true, message: '请选择转入账户' }]}
          >
            <Select placeholder="请选择转入账户">
              {accounts.map(a => (
                <Select.Option key={a.id} value={a.id}>
                  <DynamicIcon name={a.icon} size={16} /> {a.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="amount"
            label="转账金额"
            rules={[{ required: true, message: '请输入转账金额' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              min={0}
              placeholder="请输入转账金额"
              prefix="¥"
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="fee"
                label="手续费"
                initialValue={0}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="手续费"
                  prefix="¥"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="coupon"
                label="优惠券"
                initialValue={0}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="优惠券"
                  prefix="¥"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="date"
            label="转账日期"
            rules={[{ required: true, message: '请选择转账日期' }]}
            initialValue={dayjs()}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="categoryId"
            label="转账分类"
            extra="选择分类可确定现金流量活动类型（经营/投资/筹资）"
          >
            <TreeSelect
              placeholder="请选择转账分类（可选）"
              allowClear
              treeData={getTypeCategories('transfer')}
              fieldNames={{ label: 'name', value: 'id', children: 'children' }}
            />
          </Form.Item>
          <Form.Item
            name="note"
            label="备注"
          >
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 退款弹窗 */}
      <Modal
        title={editingTransaction ? '编辑退款' : '新增退款'}
        open={refundModalVisible}
        onOk={handleRefundSubmit}
        onCancel={() => setRefundModalVisible(false)}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <Form form={refundForm} layout="vertical">
          <Form.Item
            name="relatedTransactionId"
            label="关联原交易"
            rules={[{ required: true, message: '请选择原交易记录' }]}
          >
            <Select 
              placeholder="请选择要退款的交易记录" 
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) => {
                const transaction = refundableTransactions.find(t => t.id === option?.value)
                if (!transaction) return false
                const searchStr = `${transaction.category?.name || ''} ${transaction.account?.name || ''} ${transaction.note || ''} ${transaction.amount}`.toLowerCase()
                return searchStr.includes(input.toLowerCase())
              }}
            >
              {refundableTransactions.map(t => (
                <Select.Option key={t.id} value={t.id}>
                  <Space>
                    <Tag color={t.type === 'income' ? 'green' : 'red'}>{t.type === 'income' ? '收入' : '支出'}</Tag>
                    <DynamicIcon name={t.category?.icon} size={16} />
                    {t.category?.name} - ¥{t.amount.toFixed(2)}
                    <span style={{ color: '#999' }}>({dayjs(t.date).format('YYYY-MM-DD')})</span>
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="amount"
            label="退款金额"
            rules={[{ required: true, message: '请输入退款金额' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              min={0}
              placeholder="请输入退款金额"
              prefix="¥"
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="fee"
                label="手续费"
                initialValue={0}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="手续费"
                  prefix="¥"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="coupon"
                label="优惠券"
                initialValue={0}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="优惠券"
                  prefix="¥"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="accountId"
            label="退款账户"
            rules={[{ required: true, message: '请选择退款账户' }]}
            extra="退款金额将退回到此账户"
          >
            <Select placeholder="请选择退款账户">
              {accounts.map(a => (
                <Select.Option key={a.id} value={a.id}>
                  <DynamicIcon name={a.icon} size={16} /> {a.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="date"
            label="退款日期"
            rules={[{ required: true, message: '请选择退款日期' }]}
            initialValue={dayjs()}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="note"
            label="备注"
          >
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Transactions
