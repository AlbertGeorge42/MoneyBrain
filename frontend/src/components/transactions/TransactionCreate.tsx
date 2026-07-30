import React, { useEffect, useState, useMemo } from 'react'
import { Form, Segmented, Button } from 'antd'
import { Account, TransactionCategory, TransactionType } from '../../services/api'
import TransactionForm from './TransactionForm'
import ResponsiveDrawer from '../common/ResponsiveDrawer'
import { formatTransactionSubmitValues } from '../../utils/transaction'

interface TransactionCreateProps {
  visible: boolean
  accounts: Account[]
  categories: TransactionCategory[]
  initialType?: TransactionType
  onOk: (values: unknown) => Promise<void>
  onCancel: () => void
}

/**
 * 交易新建组件
 * 在抽屉中展示新建表单
 *
 * 使用 Segmented 控件切换类型（支出/收入/转账/平账）
 */
const TransactionCreate: React.FC<TransactionCreateProps> = ({
  visible,
  accounts,
  categories,
  initialType = 'expense',
  onOk,
  onCancel,
}) => {
  const [form] = Form.useForm()
  const [currentType, setCurrentType] = useState<TransactionType>(initialType)
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
    setCurrentType(key as TransactionType)
    form.resetFields()
    form.setFieldsValue({ type: key })
    setAccountBalance(null)
  }

  // Segmented 选项
  const typeOptions = useMemo(() => [
    { label: '支出', value: 'expense' },
    { label: '收入', value: 'income' },
    { label: '转账', value: 'transfer' },
    { label: '平账', value: 'adjustment' },
  ], [])

  return (
    <ResponsiveDrawer
      visible={visible}
      title="新增记录"
      onCancel={onCancel}
    >
      <Segmented
        value={currentType}
        onChange={handleTypeChange}
        options={typeOptions}
        style={{ marginBottom: 24 }}
        block
      />

      <Form form={form} layout="vertical">
        <TransactionForm
          type={currentType}
          accounts={accounts}
          categories={categories}
          form={form}
          onAccountBalanceChange={currentType === 'adjustment' ? setAccountBalance : undefined}
        />
      </Form>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <Button onClick={onCancel} size="large" style={{ flex: 1 }}>
          取消
        </Button>
        <Button
          type="primary"
          onClick={handleSubmit}
          size="large"
          style={{ flex: 2 }}
        >
          确定
        </Button>
      </div>
    </ResponsiveDrawer>
  )
}

export default TransactionCreate
