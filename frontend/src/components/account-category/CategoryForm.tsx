import React from 'react'
import { Modal, Form, Input, Select, TreeSelect } from 'antd'
import type { FormInstance } from 'antd'
import IconPicker from '../common/IconPicker'

interface CategoryFormProps {
  visible: boolean
  editing: boolean
  form: FormInstance
  categoryTree: { id: string; name: string; icon: string | null; parentId: string | null; children: any[] }[]
  onSubmit: () => void
  onCancel: () => void
}

const CategoryForm: React.FC<CategoryFormProps> = ({
  visible,
  editing,
  form,
  categoryTree,
  onSubmit,
  onCancel,
}) => (
  <Modal
    title={editing ? '编辑分类' : '新增分类'}
    open={visible}
    onOk={onSubmit}
    onCancel={onCancel}
    okText="确定"
    cancelText="取消"
  >
    <Form form={form} layout="vertical">
      <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
        <Input placeholder="请输入分类名称" />
      </Form.Item>
      <Form.Item name="type" label="分类类型" rules={[{ required: true, message: '请选择分类类型' }]}>
        <Select placeholder="请选择分类类型" disabled>
          <Select.Option value="asset">资产</Select.Option>
          <Select.Option value="liability">负债</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item name="parentId" label="父分类">
        <TreeSelect
          placeholder="请选择父分类"
          allowClear
          treeData={categoryTree}
          fieldNames={{ label: 'name', value: 'id', children: 'children' }}
        />
      </Form.Item>
      <Form.Item name="icon" label="图标">
        <IconPicker placeholder="请选择图标" />
      </Form.Item>
    </Form>
  </Modal>
)

export default CategoryForm
