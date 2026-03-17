import React, { useEffect } from 'react'
import { Modal, Form, Input, Select, InputNumber, DatePicker, Row, Col, TreeSelect } from 'antd'
import dayjs from 'dayjs'
import { Account, Category, Transaction } from '../../services/api'
import { buildTreeData } from '../../utils/treeUtils'
import DynamicIcon from '../DynamicIcon'
import { formatBalance } from '../../utils/formatBalance'

interface TransferModalProps {
  visible: boolean
  editingTransaction: Transaction | null
  accounts: Account[]
  categories: Category[]
  onOk: (values: TransferFormValues) => Promise<void>
  onCancel: () => void
}

export interface TransferFormValues {
  fromAccountId: string
  toAccountId: string
  amount: number
  fee: number
  coupon: number
  date: dayjs.Dayjs
  categoryId: string | undefined
  note: string
}

const TransferModal: React.FC<TransferModalProps> = ({
  visible,
  editingTransaction,
  accounts,
  categories,
  onOk,
  onCancel,
}) => {
  const [form] = Form.useForm()

  useEffect(() => {
    if (visible && editingTransaction) {
      form.setFieldsValue({
        amount: editingTransaction.amount,
        fee: editingTransaction.fee || 0,
        coupon: editingTransaction.coupon || 0,
        date: dayjs(editingTransaction.date),
        fromAccountId: editingTransaction.accountId,
        toAccountId: editingTransaction.toAccountId,
        categoryId: editingTransaction.categoryId,
        note: editingTransaction.note,
      })
    } else if (!visible) {
      form.resetFields()
    }
  }, [visible, editingTransaction, form])

  const getTypeCategories = (type: string) => {
    const filtered = categories.filter(c => c.type === type)
    return buildTreeData(filtered)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await onOk(values)
      form.resetFields()
    } catch (error) {
      // 错误由父组件处理
    }
  }

  return (
    <Modal
      title={editingTransaction ? '编辑转账' : '新增转账'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
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
  )
}

export default TransferModal
