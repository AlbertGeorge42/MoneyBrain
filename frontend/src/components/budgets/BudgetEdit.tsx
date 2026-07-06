import React, { useEffect, useState, useMemo } from 'react'
import { Form, Button, theme } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { Account, TransactionCategory } from '../../services/api'
import BudgetForm from './BudgetForm'
import BudgetModal from './BudgetModal'
import type { Budget } from '@shared/types'

type DetailTab = 'edit' | 'delete'

interface BudgetEditProps {
  visible: boolean
  budget: Budget | null
  accounts: Account[]
  categories: TransactionCategory[]
  onEdit: (values: unknown) => Promise<void>
  onDelete: () => Promise<void>
  onCancel: () => void
}

const BudgetEdit: React.FC<BudgetEditProps> = ({
  visible,
  budget,
  accounts,
  categories,
  onEdit,
  onDelete,
  onCancel,
}) => {
  const { token } = theme.useToken()
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState<DetailTab>('edit')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (visible && budget) {
      setActiveTab('edit')
    }
  }, [visible, budget])

  const handleEditSubmit = async () => {
    if (!budget) return
    try {
      setIsSubmitting(true)
      const values = await form.validateFields()
      const payload = {
        name: values.name,
        type: budget.type, // 编辑时类型不可修改
        amount: values.amount,
        period: values.period,
        startDate: values.dateRange?.[0]?.toISOString(),
        endDate: values.dateRange?.[1]?.toISOString() ?? null,
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

  const handleDeleteConfirm = async () => {
    if (!budget) return
    try {
      setIsSubmitting(true)
      await onDelete()
      onCancel()
    } catch {
      // 错误由父组件处理
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderEditTab = () => {
    if (!budget) return null

    return (
      <Form form={form} layout="vertical">
        <BudgetForm
          type={budget.type as 'income' | 'expense' | 'transfer'}
          editingBudget={budget}
          accounts={accounts}
          categories={categories}
          form={form}
          disableTypeSwitch={true} // 编辑模式禁止切换类型
        />
      </Form>
    )
  }

  const renderDeleteTab = () => {
    if (!budget) return null

    return (
      <div style={{ textAlign: 'center', padding: '40px 20px 0 20px' }}>
        <DeleteOutlined style={{ fontSize: 48, color: '#ff4d4f', marginBottom: 16 }} />
        <div style={{ fontSize: `${token.fontSizeLG}px`, marginBottom: `${token.padding}px` }}>
          确定要删除此预算吗？
        </div>
        <div style={{ color: token.colorTextTertiary, marginBottom: 32 }}>
          此操作不可撤销
        </div>
      </div>
    )
  }

  const tabItems = useMemo(() => [
    { key: 'edit' as DetailTab, label: '编辑', children: renderEditTab() },
    { key: 'delete' as DetailTab, label: '删除', children: renderDeleteTab() },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [budget, form, accounts, categories])

  return (
    <BudgetModal
      visible={visible}
      title="预算详情"
      onSubmit={activeTab === 'edit' ? handleEditSubmit : undefined}
      onCancel={onCancel}
      showFooterButtons={true}
      submitButtonDisabled={isSubmitting}
      extraFooterContent={
        activeTab === 'delete' ? (
          <Button type="primary" danger onClick={handleDeleteConfirm} loading={isSubmitting} size="large">
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

export default BudgetEdit