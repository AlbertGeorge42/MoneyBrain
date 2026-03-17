import React, { useEffect } from 'react'
import { Modal, Form, Input, Select, InputNumber, DatePicker, Row, Col, Tag, Space } from 'antd'
import dayjs from 'dayjs'
import { Account, Transaction } from '../../services/api'
import DynamicIcon from '../DynamicIcon'

interface RefundModalProps {
  visible: boolean
  editingTransaction: Transaction | null
  accounts: Account[]
  refundableTransactions: Transaction[]
  onOk: (values: RefundFormValues) => Promise<void>
  onCancel: () => void
}

export interface RefundFormValues {
  relatedTransactionId: string
  amount: number
  fee: number
  coupon: number
  accountId: string
  date: dayjs.Dayjs
  note: string
}

const RefundModal: React.FC<RefundModalProps> = ({
  visible,
  editingTransaction,
  accounts,
  refundableTransactions,
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
        accountId: editingTransaction.accountId,
        relatedTransactionId: editingTransaction.relatedTransactionId,
        note: editingTransaction.note,
      })
    } else if (!visible) {
      form.resetFields()
    }
  }, [visible, editingTransaction, form])

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
      title={editingTransaction ? '编辑退款' : '新增退款'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      width={600}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
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
  )
}

export default RefundModal
