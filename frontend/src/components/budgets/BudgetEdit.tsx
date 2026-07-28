import React, { useState } from 'react'
import { Form, Button } from 'antd'
import { Account, TransactionCategory } from '../../services/api'
import BudgetForm from './BudgetForm'
import ResponsiveDrawer from '../common/ResponsiveDrawer'
import type { Budget } from '@shared/types'

interface BudgetEditProps {
  visible: boolean
  budget: Budget | null
  accounts: Account[]
  categories: TransactionCategory[]
  onEdit: (values: unknown) => Promise<void>
  onCancel: () => void
  /** 返回上一层（详情视图） */
  onBack: () => void
}

/**
 * 预算编辑组件
 * 在抽屉中展示编辑表单
 *
 * 与 BudgetDetail 配合使用：
 * - 点击预算卡片 → 打开 BudgetDetail
 * - 点击编辑按钮 → 切换为 BudgetEdit
 */
const BudgetEdit: React.FC<BudgetEditProps> = ({
  visible,
  budget,
  accounts,
  categories,
  onEdit,
  onCancel,
  onBack,
}) => {
  const [form] = Form.useForm()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 表单预填由 BudgetForm 内部的 useEffect 基于 editingBudget 完成
  // 此处不再重复设置，避免覆盖 BudgetForm 中正确的 dayjs 转换

  const handleSubmit = async () => {
    if (!budget) return
    try {
      setIsSubmitting(true)
      const values = await form.validateFields()
      const payload = {
        name: values.name,
        type: budget.type,
        amount: values.amount,
        period: values.period,
        startDate: values.startDate?.toISOString(),
        endDate: values.isLongTerm ? null : (values.endDate?.toISOString() ?? null),
        transactionTime: values.transactionTime ?? null,
        note: values.note,
        accountId: values.accountId,
        toAccountId: values.toAccountId ?? null,
        categoryId: values.categoryId,
      }
      await onEdit(payload)
      onCancel()
    } catch {
      // 错误由 Form 处理
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ResponsiveDrawer
      visible={visible}
      title="编辑预算"
      onCancel={onCancel}
    >
      <BudgetForm
        type={budget?.type as 'income' | 'expense' | 'transfer' ?? 'expense'}
        editingBudget={budget}
        accounts={accounts}
        categories={categories}
        form={form}
        disableTypeSwitch={true}
      />

      {/* 底部按钮 */}
      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <Button onClick={onBack} size="large" style={{ flex: 1 }}>
          取消
        </Button>
        <Button
          type="primary"
          onClick={handleSubmit}
          loading={isSubmitting}
          size="large"
          style={{ flex: 2 }}
        >
          保存
        </Button>
      </div>
    </ResponsiveDrawer>
  )
}

export default BudgetEdit