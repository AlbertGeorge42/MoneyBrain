import React, { useEffect, useState } from 'react'
import { Modal, Drawer, Form, Input, Select, InputNumber, DatePicker, Row, Col, Tag, Space } from 'antd'
import dayjs from 'dayjs'
import { Account, Transaction } from '../../services/api'
import DynamicIcon from '../common/DynamicIcon'
import {
  colorMuted,
  colorIncome,
  colorExpense,
} from '../../styles/tokens'

const MOBILE_BREAKPOINT = 860

interface RefundModalProps {
  visible: boolean
  editingTransaction: Transaction | null
  accounts: Account[]
  sourceTransaction: Transaction | null
  onOk: (values: RefundFormValues) => Promise<void>
  onCancel: () => void
}

export interface RefundFormValues {
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
  sourceTransaction,
  onOk,
  onCancel,
}) => {
  const [form] = Form.useForm()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (visible && editingTransaction) {
      form.setFieldsValue({
        amount: editingTransaction.amount,
        fee: editingTransaction.fee || 0,
        coupon: editingTransaction.coupon || 0,
        date: dayjs(editingTransaction.date),
        accountId: editingTransaction.accountId,
        note: editingTransaction.note,
      })
    } else if (visible && sourceTransaction) {
      form.resetFields()
      form.setFieldsValue({
        amount: sourceTransaction.amount,
        accountId: sourceTransaction.accountId,
        date: dayjs(),
      })
    } else if (!visible) {
      form.resetFields()
    }
  }, [visible, editingTransaction, sourceTransaction, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await onOk(values)
      form.resetFields()
    } catch {
      // 错误由 Form 处理
    }
  }

  const renderSourceInfo = () => {
    if (editingTransaction) {
      return (
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6 }}>
          <div style={{ color: colorMuted, fontSize: 12, marginBottom: 8 }}>关联交易</div>
          <Space>
            <Tag style={{ color: editingTransaction.relatedTransaction?.type === 'income' ? colorIncome : colorExpense, borderColor: editingTransaction.relatedTransaction?.type === 'income' ? colorIncome : colorExpense, backgroundColor: 'transparent' }}>
              {editingTransaction.relatedTransaction?.type === 'income' ? '收入' : '支出'}
            </Tag>
            <DynamicIcon name={editingTransaction.relatedTransaction?.category?.icon} size={16} />
            {editingTransaction.relatedTransaction?.category?.name} - ¥{editingTransaction.relatedTransaction?.amount.toFixed(2)}
            <span style={{ color: colorMuted }}>({dayjs(editingTransaction.relatedTransaction?.date).format('YYYY-MM-DD')})</span>
          </Space>
        </div>
      )
    }

    if (sourceTransaction) {
      return (
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6 }}>
          <div style={{ color: colorMuted, fontSize: 12, marginBottom: 8 }}>原交易</div>
          <Space>
            <Tag style={{ color: sourceTransaction.type === 'income' ? colorIncome : colorExpense, borderColor: sourceTransaction.type === 'income' ? colorIncome : colorExpense, backgroundColor: 'transparent' }}>
              {sourceTransaction.type === 'income' ? '收入' : '支出'}
            </Tag>
            <DynamicIcon name={sourceTransaction.category?.icon} size={16} />
            {sourceTransaction.category?.name} - ¥{sourceTransaction.amount.toFixed(2)}
            <span style={{ color: colorMuted }}>({dayjs(sourceTransaction.date).format('YYYY-MM-DD')})</span>
          </Space>
        </div>
      )
    }

    return null
  }

  const modalContent = (
    <>
      <Form form={form} layout="vertical">
        {renderSourceInfo()}
        <Form.Item
          name="amount"
          label="退款金额"
          rules={[{ required: true, message: '请输入退款金额' }]}
        >
          <InputNumber
            style={{ width: '100%' }}
            precision={2}
            min={0.01}
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
    </>
  )

  if (isMobile) {
    return (
      <Drawer
        title={editingTransaction ? '编辑退款' : '新增退款'}
        placement="bottom"
        height="70vh"
        open={visible}
        onClose={onCancel}
        destroyOnClose
        styles={{
          body: {
            paddingBottom: 80,
          },
        }}
      >
        {modalContent}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px',
            borderTop: '1px solid #f0f0f0',
            background: '#fff',
          }}
        >
          <button
            onClick={handleSubmit}
            style={{
              width: '100%',
              padding: '12px 24px',
              backgroundColor: '#1677ff',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            确定
          </button>
          <button
            onClick={onCancel}
            style={{
              width: '100%',
              padding: '12px 24px',
              marginTop: '8px',
              backgroundColor: '#fff',
              color: '#333',
              border: '1px solid #d9d9d9',
              borderRadius: '8px',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
        </div>
      </Drawer>
    )
  }

  return (
    <Modal
      title={editingTransaction ? '编辑退款' : '新增退款'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      width={440}
      destroyOnClose
    >
      {modalContent}
    </Modal>
  )
}

export default RefundModal
