import React, { useEffect, useState } from 'react'
import { Modal, Drawer, Segmented, Form } from 'antd'
import { Account, TransactionCategory, Transaction } from '../../services/api'
import TransactionForm, { TransactionFormType } from './TransactionForm'

const MOBILE_BREAKPOINT = 860

interface TransactionDrawerProps {
  visible: boolean
  title: string
  editingTransaction: Transaction | null
  accounts: Account[]
  categories: TransactionCategory[]
  initialType: TransactionFormType
  onOk: (values: unknown) => Promise<void>
  onCancel: () => void
}

const TransactionDrawer: React.FC<TransactionDrawerProps> = ({
  visible,
  title,
  editingTransaction,
  accounts,
  categories,
  initialType,
  onOk,
  onCancel,
}) => {
  const [form] = Form.useForm()
  const [isMobile, setIsMobile] = useState(false)
  const [currentType, setCurrentType] = useState<TransactionFormType>(initialType)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (visible) {
      if (editingTransaction) {
        if (editingTransaction.type === 'transfer') {
          setCurrentType('transfer')
        } else {
          setCurrentType(editingTransaction.type as TransactionFormType)
        }
      } else {
        setCurrentType(initialType)
      }
    }
  }, [visible, editingTransaction, initialType])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      let submitValues = { ...values }

      if (currentType === 'transfer') {
        submitValues = {
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
      } else {
        submitValues = {
          type: currentType,
          amount: values.amount,
          fee: values.fee || 0,
          coupon: values.coupon || 0,
          date: values.date.format('YYYY-MM-DD'),
          accountId: values.accountId,
          categoryId: values.categoryId,
          note: values.note,
        }
      }

      await onOk(submitValues)
      form.resetFields()
    } catch {
      // 错误由 Form 处理
    }
  }

  const handleTypeChange = (value: string) => {
    setCurrentType(value as TransactionFormType)
    form.resetFields()
    form.setFieldsValue({ type: value })
  }

  const typeOptions = [
    { label: '支出', value: 'expense' },
    { label: '收入', value: 'income' },
    { label: '转账', value: 'transfer' },
  ]

  const segmentedOptions = {
    marginBottom: 16,
    width: '100%',
  }

  const renderSegmented = (size: 'small' | 'large' = 'large') => (
    <Segmented
      value={currentType}
      options={typeOptions}
      onChange={handleTypeChange}
      style={segmentedOptions}
      size={size}
    />
  )

  const modalContent = (
    <>
      {!editingTransaction && renderSegmented()}
      <Form form={form} layout="vertical">
        <TransactionForm
          type={currentType}
          editingTransaction={editingTransaction}
          accounts={accounts}
          categories={categories}
          form={form}
        />
      </Form>
    </>
  )

  if (isMobile) {
    return (
      <Drawer
        title={title}
        placement="bottom"
        height="85vh"
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
      title={title}
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      destroyOnClose
      width={520}
    >
      {!editingTransaction && renderSegmented()}
      <Form form={form} layout="vertical">
        <TransactionForm
          type={currentType}
          editingTransaction={editingTransaction}
          accounts={accounts}
          categories={categories}
          form={form}
        />
      </Form>
    </Modal>
  )
}

export default TransactionDrawer
