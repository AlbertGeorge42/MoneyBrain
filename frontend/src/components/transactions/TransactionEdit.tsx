import React, { useEffect, useState, useMemo } from 'react'
import { Form, Button, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { Account, TransactionCategory, Transaction } from '../../services/api'
import TransactionForm, { TransactionFormType } from './TransactionForm'
import TransactionModal from './TransactionModal'
import { colorMuted } from '../../styles/tokens'
import { formatTransactionSubmitValues } from '../../utils/transaction'

type DetailTab = 'edit' | 'refund' | 'delete'

interface TransactionEditProps {
  visible: boolean
  transaction: Transaction | null
  accounts: Account[]
  categories: TransactionCategory[]
  onEdit: (values: unknown) => Promise<void>
  onRefund: (values: unknown) => Promise<void>
  onDelete: () => Promise<void>
  onCancel: () => void
}

const TransactionEdit: React.FC<TransactionEditProps> = ({
  visible,
  transaction,
  accounts,
  categories,
  onEdit,
  onRefund,
  onDelete,
  onCancel,
}) => {
  const [form] = Form.useForm()
  const [refundForm] = Form.useForm()
  const [activeTab, setActiveTab] = useState<DetailTab>('edit')

  useEffect(() => {
    if (visible && transaction) {
      setActiveTab('edit')
    }
  }, [visible, transaction])

  const canRefund = transaction && (transaction.type === 'income' || transaction.type === 'expense')
  const isRefundTransaction = transaction?.type === 'refund'

  const getEditType = (tx: Transaction): TransactionFormType => {
    if (tx.type === 'transfer') return 'transfer'
    if (tx.type === 'income') return 'income'
    if (tx.type === 'expense') return 'expense'
    return 'refund'
  }

  const handleEditSubmit = async () => {
    if (!transaction) return
    try {
      if (isRefundTransaction) {
        const values = await form.validateFields()
        const submitValues = {
          type: 'refund' as const,
          amount: values.amount,
          fee: values.fee || 0,
          coupon: values.coupon || 0,
          date: values.date.format('YYYY-MM-DD'),
          accountId: values.accountId,
          note: values.note,
          relatedTransactionId: transaction.relatedTransactionId,
          relatedType: transaction.relatedType,
        }
        await onEdit(submitValues)
      } else {
        const values = await form.validateFields()
        const submitValues = formatTransactionSubmitValues(values, getEditType(transaction))
        await onEdit(submitValues)
      }
      message.success('更新成功')
      onCancel()
    } catch {
      // 错误由 Form 处理
    }
  }

  const handleRefundSubmit = async () => {
    if (!transaction) return
    try {
      const values = await refundForm.validateFields()
      const refundData = {
        ...values,
        date: values.date.format('YYYY-MM-DD'),
      }
      await onRefund(refundData)
      message.success('退款记录成功')
      onCancel()
    } catch {
      // 错误由 Form 处理，不再显示重复错误消息
    }
  }

  const handleDeleteConfirm = async () => {
    if (!transaction) return
    try {
      await onDelete()
      message.success('删除成功')
      onCancel()
    } catch {
      message.error('删除失败')
    }
  }

  const renderEditTab = () => {
    if (!transaction) return null
    const type = getEditType(transaction)

    return (
      <Form form={form} layout="vertical">
        <TransactionForm
          type={type}
          editingTransaction={transaction}
          accounts={accounts}
          categories={categories}
          form={form}
        />
      </Form>
    )
  }

  const renderRefundTab = () => {
    if (!transaction) return null

    return (
      <Form form={refundForm} layout="vertical">
        <TransactionForm
          type="refund"
          accounts={accounts}
          categories={categories}
          form={refundForm}
          showRefundSourceInfo={true}
          sourceTransaction={transaction}
        />
      </Form>
    )
  }

  const renderDeleteTab = () => {
    if (!transaction) return null

    return (
      <div style={{ textAlign: 'center', padding: '40px 20px 0 20px' }}>
        <DeleteOutlined style={{ fontSize: 48, color: '#ff4d4f', marginBottom: 16 }} />
        <div style={{ fontSize: 16, marginBottom: 16 }}>
          确定要删除此交易记录吗？
        </div>
        <div style={{ color: colorMuted, marginBottom: 32 }}>
          此操作不可撤销
        </div>
      </div>
    )
  }

  const tabItems = useMemo(() => {
    const items = [
      { key: 'edit' as DetailTab, label: '编辑', children: renderEditTab() },
    ]
    if (!isRefundTransaction && transaction && (transaction.type === 'income' || transaction.type === 'expense')) {
      items.push({ key: 'refund' as DetailTab, label: '退款', children: renderRefundTab() })
    }
    items.push({ key: 'delete' as DetailTab, label: '删除', children: renderDeleteTab() })
    return items
  }, [transaction, form, refundForm, accounts, categories, isRefundTransaction])

  const getActiveSubmitHandler = () => {
    switch (activeTab) {
      case 'edit':
        return handleEditSubmit
      case 'refund':
        return canRefund ? handleRefundSubmit : undefined
      case 'delete':
        return undefined
      default:
        return undefined
    }
  }

  return (
    <TransactionModal
      visible={visible}
      title="交易详情"
      onSubmit={getActiveSubmitHandler()}
      onCancel={onCancel}
      showFooterButtons={true}
      extraFooterContent={
        activeTab === 'delete' ? (
          <Button type="primary" danger onClick={handleDeleteConfirm} size="large">
            确认删除
          </Button>
        ) : null
      }
      tabItems={tabItems}
      activeTab={activeTab}
      onTabChange={(key) => setActiveTab(key as DetailTab)}
    />
  )
}

export default TransactionEdit
