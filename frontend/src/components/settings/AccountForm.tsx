import React from 'react'
import { Modal, Form, Input, InputNumber, DatePicker } from 'antd'
import type { FormInstance } from 'antd'
import IconPicker from '../common/IconPicker'
import ColorSwatchPicker from '../common/ColorSwatchPicker'

interface AccountFormProps {
  visible: boolean
  editing: boolean
  form: FormInstance
  onSubmit: () => void
  onCancel: () => void
}

const AccountForm: React.FC<AccountFormProps> = ({
  visible,
  editing,
  form,
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
      <Form.Item name="icon" label="图标">
        <IconPicker placeholder="请选择图标" />
      </Form.Item>
      <Form.Item name="color" label="颜色" extra="用于报表中账户图标的背景色（不选则使用中性色）">
        <ColorSwatchPicker allowClear />
      </Form.Item>
    </Form>
  </Modal>
)

export default AccountForm
