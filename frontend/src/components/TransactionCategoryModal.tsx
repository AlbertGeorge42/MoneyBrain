import React, { useState, useEffect } from 'react'
import { Modal, Tabs, Table, Button, Form, Input, Space, Popconfirm, message, Select, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { Category, categoryApi } from '../services/api'

interface Props {
  visible: boolean
  onClose: () => void
}

const TransactionCategoryModal: React.FC<Props> = ({ visible, onClose }) => {
  const { categories, fetchCategories } = useStore()

  const [activeTab, setActiveTab] = useState('income')
  const [editingItem, setEditingItem] = useState<Category | null>(null)
  const [formVisible, setFormVisible] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    if (visible) {
      fetchCategories()
    }
  }, [visible])

  const handleAdd = (parentId?: string) => {
    setEditingItem(null)
    form.resetFields()
    if (parentId) {
      const parent = categories.find(c => c.id === parentId)
      form.setFieldsValue({ type: parent?.type, parentId, cashFlowType: parent?.cashFlowType })
    } else {
      form.setFieldsValue({ type: activeTab })
    }
    setFormVisible(true)
  }

  const handleEdit = (record: Category) => {
    setEditingItem(record)
    form.setFieldsValue({
      name: record.name,
      icon: record.icon,
      parentId: record.parentId,
      cashFlowType: record.cashFlowType,
    })
    setFormVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await categoryApi.delete(id)
      message.success('删除成功')
      fetchCategories()
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingItem) {
        await categoryApi.update(editingItem.id, values)
        message.success('更新成功')
      } else {
        await categoryApi.create(values)
        message.success('创建成功')
      }
      setFormVisible(false)
      fetchCategories()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const buildTreeData = (items: Category[], parentId: string | null = null): any[] => {
    return items
      .filter(c => c.parentId === parentId)
      .map(c => ({
        ...c,
        children: buildTreeData(items, c.id),
      }))
  }

  const columns = [
    {
      title: '图标',
      dataIndex: 'icon',
      width: 50,
      render: (icon: string) => <span style={{ fontSize: 16 }}>{icon || '📝'}</span>,
    },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '层级',
      dataIndex: 'parentId',
      width: 80,
      render: (parentId: string | null) => 
        parentId ? <Tag color="blue">二级</Tag> : <Tag color="green">一级</Tag>,
    },
    {
      title: '现金流类型',
      dataIndex: 'cashFlowType',
      width: 100,
      render: (value: string) => {
        const typeMap: Record<string, { color: string; text: string }> = {
          operating: { color: 'green', text: '经营' },
          investing: { color: 'blue', text: '投资' },
          financing: { color: 'orange', text: '筹资' },
        }
        return value ? <Tag color={typeMap[value]?.color}>{typeMap[value]?.text}</Tag> : '-'
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: Category) => (
        <Space size="small">
          {!record.parentId && (
            <Button type="link" size="small" onClick={() => handleAdd(record.id)}>
              添加子分类
            </Button>
          )}
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm
            title="确定要删除此分类吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const tabItems = [
    {
      key: 'income',
      label: '收入分类',
      children: (
        <Table
          dataSource={buildTreeData(categories.filter(c => c.type === 'income'))}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
          expandable={{ childrenColumnName: 'children', defaultExpandAllRows: true }}
        />
      ),
    },
    {
      key: 'expense',
      label: '支出分类',
      children: (
        <Table
          dataSource={buildTreeData(categories.filter(c => c.type === 'expense'))}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
          expandable={{ childrenColumnName: 'children', defaultExpandAllRows: true }}
        />
      ),
    },
  ]

  return (
    <>
      <Modal
        title="收支分类设置"
        open={visible}
        onCancel={onClose}
        footer={null}
        width={800}
      >
        <div style={{ marginBottom: 12 }}>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAdd()}>
            新增一级分类
          </Button>
        </div>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Modal>

      <Modal
        title={editingItem ? '编辑分类' : '新增分类'}
        open={formVisible}
        onOk={handleSubmit}
        onCancel={() => setFormVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="type" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="parentId" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input placeholder="请输入分类名称" />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="请输入图标(如💰)" />
          </Form.Item>
          <Form.Item name="cashFlowType" label="现金流活动类型">
            <Select placeholder="请选择现金流活动类型" allowClear>
              <Select.Option value="operating">经营活动</Select.Option>
              <Select.Option value="investing">投资活动</Select.Option>
              <Select.Option value="financing">筹资活动</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default TransactionCategoryModal
