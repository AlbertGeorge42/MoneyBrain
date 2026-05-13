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

  useEffect(() => {
    if (visible) {
      setCurrentType(initialType)
      form.resetFields()
    }
  }, [visible, initialType, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const submitValues = formatTransactionSubmitValues(values, currentType)
      await onOk(submitValues)
      form.resetFields()
    } catch {
      // 错误由 Form 处理
    }
  }

  const handleTypeChange = (key: string) => {
    setCurrentType(key as TransactionFormType)
    form.resetFields()
    form.setFieldsValue({ type: key })
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
  ], [form, accounts, categories])

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
