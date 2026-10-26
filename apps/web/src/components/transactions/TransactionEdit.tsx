import React, { useState } from 'react'
import { Form, Button } from 'antd'
import { Account, TransactionCategory, Transaction, TransactionType } from '../../services/api'
import TransactionForm from './TransactionForm'
import ResponsiveDrawer from '../common/ResponsiveDrawer'
import { formatTransactionSubmitValues } from '../../utils/transaction'
import { minor, fromMajor, type Minor } from '@domain/index'
import { useNotify } from '../../hooks/useNotify'

export type TransactionEditMode = 'edit' | 'refund'

interface TransactionEditProps {
  visible: boolean
  transaction: Transaction | null
  accounts: Account[]
  categories: TransactionCategory[]
  onEdit: (values: unknown) => Promise<void>
  onRefund: (values: unknown) => Promise<void>
  onCancel: () => void
  /** 返回上一层（详情视图） */
  onBack: () => void
  /** 编辑模式：由父组件决定是编辑还是退款，无需切换 */
  mode?: TransactionEditMode
}

/**
 * 交易编辑组件
 * 在抽屉中展示编辑表单
 *
 * 与 TransactionDetail 配合使用：
 * - 点击交易行 → 打开 TransactionDetail
 * - 点击编辑按钮 → 打开 TransactionEdit (mode='edit')
 * - 点击退款按钮 → 打开 TransactionEdit (mode='refund')
 */
const TransactionEdit: React.FC<TransactionEditProps> = ({
  visible,
  transaction,
  accounts,
  categories,
  onEdit,
  onRefund,
  onCancel,
  onBack,
  mode = 'edit',
}) => {
  const [form] = Form.useForm()
  const [refundForm] = Form.useForm()
  const [accountBalance, setAccountBalance] = useState<Minor | null>(null)
  const notify = useNotify()

  const isRefundMode = mode === 'refund'
  const isRefundTransaction = transaction?.type === 'refund'

  const getEditType = (tx: Transaction): TransactionType => {
    if (tx.type === 'transfer') return 'transfer'
    if (tx.type === 'income') return 'income'
    if (tx.type === 'expense') return 'expense'
    if (tx.type === 'adjustment') return 'adjustment'
    return 'refund'
  }

  const handleEditSubmit = async () => {
    if (!transaction) return
    const editType = getEditType(transaction)
    try {
      if (isRefundTransaction) {
        const values = await form.validateFields()
        // 表单显示的是「原始录入金额」，提交时必须按退款规则还原为净现金流，
        // 否则带手续费/优惠券的退款在编辑后会被重复放大。
        const submitValues = {
          ...formatTransactionSubmitValues(values, 'refund'),
          relatedTransactionId: transaction.relatedTransactionId,
          relatedType: transaction.relatedType,
        }
        await onEdit(submitValues)
      } else if (editType === 'adjustment') {
        const values = await form.validateFields()
        if (accountBalance === null) {
          notify.error('无法获取账户余额')
          return
        }
        const adjustmentValue = minor(fromMajor(values.amount) - accountBalance)
        const submitValues = {
          type: 'adjustment' as const,
          amount: adjustmentValue,
          fee: 0,
          coupon: 0,
          date: values.date.format('YYYY-MM-DD'),
          accountId: values.accountId,
          categoryId: null,
          note: values.note,
        }
        await onEdit(submitValues)
      } else {
        const values = await form.validateFields()
        const submitValues = formatTransactionSubmitValues(values, editType)
        await onEdit(submitValues)
      }
      onCancel()
    } catch {
      // 错误由 Form 处理
    }
  }

  const handleRefundSubmit = async () => {
    if (!transaction) return
    try {
      const values = await refundForm.validateFields()
      // 表单输入是元，统一在这里转成分
      const refundData = formatTransactionSubmitValues(values, 'refund')
      await onRefund(refundData)
      onCancel()
    } catch {
      // 错误由 Form 处理
    }
  }

  const renderForm = () => {
    if (!transaction) return null

    // 退款模式
    if (isRefundMode && !isRefundTransaction) {
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

    // 编辑模式
    const type = getEditType(transaction)
    return (
      <Form form={form} layout="vertical">
        <TransactionForm
          type={type}
          editingTransaction={transaction}
          accounts={accounts}
          categories={categories}
          form={form}
          onAccountBalanceChange={type === 'adjustment' ? setAccountBalance : undefined}
        />
      </Form>
    )
  }

  return (
    <ResponsiveDrawer
      visible={visible}
      title={isRefundMode && !isRefundTransaction ? '退款' : '编辑交易'}
      onCancel={onCancel}
    >
      {renderForm()}

      {/* 底部按钮 */}
      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <Button onClick={onBack} size="large" style={{ flex: 1 }}>
          取消
        </Button>
        <Button
          type="primary"
          onClick={isRefundMode ? handleRefundSubmit : handleEditSubmit}
          size="large"
          style={{ flex: 2 }}
        >
          {isRefundMode ? '确认退款' : '保存'}
        </Button>
      </div>
    </ResponsiveDrawer>
  )
}

export default TransactionEdit