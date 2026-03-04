import React, { useEffect, useState } from 'react'
import { 
  Table, Button, Modal, Form, Input, Select, InputNumber, DatePicker, 
  Space, Card, Tag, Popconfirm, message, Row, Col, Statistic, TreeSelect 
} from 'antd'
import { EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useStore } from '../stores'
import { Transaction, Category } from '../services/api'

const { RangePicker } = DatePicker

const Transactions: React.FC = () => {
  const { 
    transactions, 
    accounts, 
    categories,
    loading, 
    fetchTransactions, 
    fetchAccounts,
    fetchCategories,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  } = useStore()

  const [modalVisible, setModalVisible] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [form] = Form.useForm()
  const [filters, setFilters] = useState({
    type: undefined as string | undefined,
    accountId: undefined as string | undefined,
    categoryId: undefined as string | undefined,
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
  })

  useEffect(() => {
    fetchTransactions()
    fetchAccounts()
    fetchCategories()
  }, [])

  const buildTreeData = (cats: Category[], parentId: string | null = null): any[] => {
    return cats
      .filter(c => c.parentId === parentId)
      .map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        parentId: c.parentId,
        children: buildTreeData(cats, c.id),
      }))
  }

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

  const handleEdit = (record: Transaction) => {
    setEditingTransaction(record)
    form.setFieldsValue({
      type: record.type,
      amount: record.amount,
      date: dayjs(record.date),
      accountId: record.accountId,
      categoryId: record.categoryId,
      note: record.note,
    })
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

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const data = {
        ...values,
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

  const handleSearch = () => {
    const params: Record<string, unknown> = {}
    if (filters.type) params.type = filters.type
    if (filters.accountId) params.accountId = filters.accountId
    if (filters.categoryId) params.categoryId = filters.categoryId
    if (filters.dateRange) {
      params.startDate = filters.dateRange[0].format('YYYY-MM-DD')
      params.endDate = filters.dateRange[1].format('YYYY-MM-DD')
    }
    fetchTransactions(params)
  }

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
  const balance = totalIncome - totalExpense

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
      render: (type: string) => (
        <Tag color={type === 'income' ? 'green' : 'red'}>
          {type === 'income' ? '收入' : '支出'}
        </Tag>
      ),
    },
    {
      title: '分类',
      dataIndex: ['category', 'name'],
      key: 'category',
      render: (name: string, record: Transaction) => (
        <span>{record.category?.icon} {name || '未分类'}</span>
      ),
    },
    {
      title: '账户',
      dataIndex: ['account', 'name'],
      key: 'account',
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number, record: Transaction) => (
        <span style={{ color: record.type === 'income' ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
          {record.type === 'income' ? '+' : '-'}¥{amount.toFixed(2)}
        </span>
      ),
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
        <h2 style={{ margin: 0 }}>收支记录</h2>
        <Space>
          <Button type="primary" icon={<ArrowUpOutlined />} onClick={() => handleAdd('income')}>
            记收入
          </Button>
          <Button danger icon={<ArrowDownOutlined />} onClick={() => handleAdd('expense')}>
            记支出
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
                <Select.Option key={a.id} value={a.id}>{a.icon} {a.name}</Select.Option>
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
          <Col span={8}>
            <Statistic
              title="总收入"
              value={totalIncome}
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="总支出"
              value={totalExpense}
              precision={2}
              valueStyle={{ color: '#cf1322' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="结余"
              value={balance}
              precision={2}
              valueStyle={{ color: balance >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table 
          dataSource={transactions} 
          columns={columns} 
          rowKey="id"
          pagination={{ pageSize: 20 }}
          loading={loading}
        />
      </Card>

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
                  {a.icon} {a.name}
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
    </div>
  )
}

export default Transactions
