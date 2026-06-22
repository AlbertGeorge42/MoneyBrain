import React, { useEffect, useState, useMemo } from 'react'
import { Form } from 'antd'
import { Account, TransactionCategory } from '../../services/api'
import TransactionForm, { TransactionFormType } from './TransactionForm'
import TransactionModal from './TransactionModal'
import { formatTransactionSubmitValues } from '../../utils/transaction'

interface TransactionCreateProps {
  visible: boolean
  accounts: Account[]
  categories: TransactionCategory[]
  initialType?: TransactionFormType
  onOk: (values: unknown) => Promise<void>
  onCancel: () => void
}

const TransactionCreate: React.FC<TransactionCreateProps> = ({
  visible,
  accounts,
  categories,
  initialType = 'expense',
  onOk,
  onCancel,
}) => {
  const [form] = Form.useForm()
  const [currentType, setCurrentType] = useState<TransactionFormType>(initialType)
  const [accountBalance, setAccountBalance] = useState<number | null>(null)

  useEffect(() => {
    if (visible) {
      setCurrentType(initialType)
      form.resetFields()
      setAccountBalance(null)
    }
  }, [visible, initialType, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      // adjustment 类型：计算平账值
      if (currentType === 'adjustment' && accountBalance !== null) {
        const adjustmentValue = values.amount - accountBalance
        values.amount = adjustmentValue
      }

      const submitValues = formatTransactionSubmitValues(values, currentType)
      await onOk(submitValues)
      form.resetFields()
      setAccountBalance(null)
    } catch {
      // 错误由 Form 处理
    }
  }

  const handleTypeChange = (key: string) => {
    setCurrentType(key as TransactionFormType)
    form.resetFields()
    form.setFieldsValue({ type: key })
    setAccountBalance(null)
  }

  const tabItems = useMemo(() => [
    { key: 'expense', label: '支出', children: (
      <Form form={form} layout="vertical">
        <TransactionForm
          type="expense"
          accounts={accounts}
          categories={categories}
          form={form}
        />
      </Form>
    )},
    { key: 'income', label: '收入', children: (
      <Form form={form} layout="vertical">
        <TransactionForm
          type="income"
          accounts={accounts}
          categories={categories}
          form={form}
        />
      </Form>
    )},
    { key: 'transfer', label: '转账', children: (
      <Form form={form} layout="vertical">
        <TransactionForm
          type="transfer"
          accounts={accounts}
          categories={categories}
          form={form}
        />
      </Form>
    )},
    { key: 'adjustment', label: '平账', children: (
      <Form form={form} layout="vertical">
        <TransactionForm
          type="adjustment"
          accounts={accounts}
          categories={categories}
          form={form}
          onAccountBalanceChange={setAccountBalance}
        />
      </Form>
    )},
  ], [form, accounts, categories, setAccountBalance])

  return (
    <TransactionModal
      visible={visible}
      title="新增记录"
      onSubmit={handleSubmit}
      onCancel={onCancel}
      // 使用 TransactionModal 内置的 Tabs 支持
      tabItems={tabItems}
      activeTab={currentType}
      onTabChange={handleTypeChange}
    />
  )
}

export default TransactionCreate
