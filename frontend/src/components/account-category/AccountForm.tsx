import React from 'react'
import { Modal, Form, Input, Select, TreeSelect, InputNumber, DatePicker } from 'antd'
import type { FormInstance } from 'antd'
import IconPicker from '../common/IconPicker'

interface AccountFormProps {
  visible: boolean
  editing: boolean
  form: FormInstance
  categoryTree: { id: string; name: string; icon: string | null; parentId: string | null; children: any[] }[]
  onSubmit: () => void
  onCancel: () => void
}

const AccountForm: React.FC<AccountFormProps> = ({
  visible,
  editing,
  form,
  categoryTree,
  onSubmit,
  onCancel,
}) => (
  <Modal
    title={editing ? '编辑账户' : '新增账户'}
    open={visible}
    onOk={onSubmit}
    onCancel={onCancel}
    okText="确定"
    cancelText="取消"
  >
    <Form form={form} layout="vertical">
      <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }]}>
        <Input placeholder="请输入账户名称" />
      </Form.Item>
      <Form.Item name="type" label="账户类型" rules={[{ required: true, message: '请选择账户类型' }]}>
        <Select 
          placeholder="请选择账户类型"
          onChange={() => {
            form.setFieldsValue({ categoryId: undefined })
          }}
        >
          <Select.Option value="asset">资产</Select.Option>
          <Select.Option value="liability">负债</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item
        name="initialBalance"
        label="初始余额"
        initialValue={0}
        rules={[{ required: true, message: '请输入初始余额' }]}
        extra="负债账户请填写负值（如信用卡欠款5000元填写-5000）"
      >
        <InputNumber style={{ width: '100%' }} precision={2} placeholder="请输入初始余额" />
      </Form.Item>
      <Form.Item name="initialBalanceDate" label="初始余额日期" rules={[{ required: true, message: '请选择初始余额日期' }]}>
        <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="选择日期" />
      </Form.Item>
      <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}>
        {() => (
          <Form.Item name="categoryId" label="所属分类">
            <TreeSelect
              placeholder="请选择账户分类"
              allowClear
              treeData={categoryTree}
              fieldNames={{ label: 'name', value: 'id', children: 'children' }}
            />
          </Form.Item>
        )}
      </Form.Item>
      <Form.Item name="icon" label="图标">
        <IconPicker placeholder="请选择图标" />
      </Form.Item>
    </Form>
  </Modal>
)

export default AccountForm
