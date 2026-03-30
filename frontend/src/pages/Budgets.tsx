import React, { useEffect, useState } from 'react'
import { 
  Table, Button, Modal, Form, Input, Select, InputNumber, 
  Space, Card, Tag, Popconfirm, message, Row, Col, Progress, Statistic 
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { Budget } from '../services/api'
import * as api from '../services/api'
import DynamicIcon from '../components/common/DynamicIcon'

const Budgets: React.FC = () => {
  const { 
    budgets, 
    transactionCategories,
    loading, 
    fetchBudgets, 
    fetchTransactionCategories,
    addBudget,
    updateBudget,
    deleteBudget,
  } = useStore()

  const [modalVisible, setModalVisible] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [form] = Form.useForm()
  const [budgetStatuses, setBudgetStatuses] = useState<Record<string, any>>({})

  useEffect(() => {
    fetchBudgets()
    fetchTransactionCategories()
  }, [])

  useEffect(() => {
    budgets.forEach(budget => {
      fetchBudgetStatus(budget.id)
    })
  }, [budgets])

  const fetchBudgetStatus = async (id: string) => {
    try {
      const res = await api.budgetApi.getStatus(id)
      if (res.data.success && res.data.data) {
        setBudgetStatuses(prev => ({
          ...prev,
          [id]: res.data.data,
        }))
      }
    } catch (error) {
      console.error('获取预算状态失败:', error)
    }
  }

  const handleAdd = () => {
    setEditingBudget(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: Budget) => {
    setEditingBudget(record)
    form.setFieldsValue({
      name: record.name,
      amount: record.amount,
      period: record.period,
      categoryId: record.categoryId,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteBudget(id)
      message.success('删除成功')
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingBudget) {
        await updateBudget(editingBudget.id, values)
        message.success('更新成功')
      } else {
        await addBudget(values)
        message.success('创建成功')
      }
      setModalVisible(false)
      form.resetFields()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const expenseCategories = transactionCategories.filter(c => c.type === 'expense')

  const columns = [
    {
      title: '预算名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '周期',
      dataIndex: 'period',
      key: 'period',
      render: (period: string) => (
        <Tag color={period === 'monthly' ? 'blue' : 'green'}>
          {period === 'monthly' ? '月度' : '年度'}
        </Tag>
      ),
    },
    {
      title: '分类',
      dataIndex: ['category', 'name'],
      key: 'category',
      render: (name: string) => name || '全部',
    },
    {
      title: '预算金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `¥${amount.toFixed(2)}`,
    },
    {
      title: '执行进度',
      key: 'progress',
      render: (_: unknown, record: Budget) => {
        const status = budgetStatuses[record.id]
        if (!status) return <span>加载中...</span>
        const { used, percentage, isOverBudget } = status
        return (
          <div style={{ width: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>¥{used.toFixed(2)}</span>
              <span>{percentage}%</span>
            </div>
            <Progress 
              percent={percentage} 
              size="small" 
              status={isOverBudget ? 'exception' : (percentage >= 80 ? 'normal' : 'active')}
              strokeColor={isOverBudget ? '#cf1322' : (percentage >= 80 ? '#faad14' : '#1890ff')}
            />
            {isOverBudget && (
              <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4 }}>
                <WarningOutlined /> 已超支
              </div>
            )}
          </div>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: Budget) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="确定要删除此预算吗？"
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

  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0)
  const totalUsed = Object.values(budgetStatuses).reduce((sum, s: any) => sum + (s?.used || 0), 0)

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>预算管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增预算
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="总预算"
              value={totalBudget}
              precision={2}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="已使用"
              value={totalUsed}
              precision={2}
              valueStyle={{ color: '#cf1322' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="剩余"
              value={totalBudget - totalUsed}
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table 
          dataSource={budgets} 
          columns={columns} 
          rowKey="id"
          pagination={false}
          loading={loading}
        />
      </Card>

      <Modal
        title={editingBudget ? '编辑预算' : '新增预算'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="预算名称"
            rules={[{ required: true, message: '请输入预算名称' }]}
          >
            <Input placeholder="请输入预算名称" />
          </Form.Item>
          <Form.Item
            name="amount"
            label="预算金额"
            rules={[{ required: true, message: '请输入预算金额' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              min={0}
              placeholder="请输入预算金额"
              prefix="¥"
            />
          </Form.Item>
          <Form.Item
            name="period"
            label="预算周期"
            rules={[{ required: true, message: '请选择预算周期' }]}
          >
            <Select placeholder="请选择预算周期">
              <Select.Option value="monthly">月度</Select.Option>
              <Select.Option value="yearly">年度</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="categoryId"
            label="支出分类"
            extra="不选择则为总预算"
          >
            <Select placeholder="请选择支出分类" allowClear>
              {expenseCategories.map(c => (
                <Select.Option key={c.id} value={c.id}>
                  <DynamicIcon name={c.icon} size={16} /> {c.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Budgets
