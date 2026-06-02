import React, { useState, useMemo } from 'react'
import {
  Button, Card, Progress, Space, Tag, Empty, theme,
  Typography, Popconfirm, message, Form,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SwapOutlined,
} from '@ant-design/icons'
import { PageHeader } from '../components/common'
import { BudgetModal, BudgetForm, BudgetFormType } from '../components/budgets'
import {
  useBudgets,
  useBudgetStatuses,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
  useAccounts,
  useTransactionCategories,
} from '../queries'
import type { Budget, BudgetStatus } from '@shared/types'
import dayjs from 'dayjs'

const { Text } = Typography

const BUDGET_TYPE_META = {
  income: { label: '收入预算', color: 'green', icon: <ArrowUpOutlined /> },
  expense: { label: '支出预算', color: 'red', icon: <ArrowDownOutlined /> },
  transfer: { label: '转账预算', color: 'blue', icon: <SwapOutlined /> },
} as const

const PERIOD_LABELS: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '月度',
  quarterly: '季度',
  yearly: '年度',
}

const Budgets: React.FC = () => {
  const { token } = theme.useToken()

  const { data: budgets = [] } = useBudgets()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useTransactionCategories()
  const budgetIds = useMemo(() => budgets.map((b) => b.id), [budgets])
  const { data: budgetStatuses = [] } = useBudgetStatuses(budgetIds)

  const createBudget = useCreateBudget()
  const updateBudget = useUpdateBudget()
  const deleteBudgetMutation = useDeleteBudget()

  const [activeTab] = useState<string>('expense')
  const [modalVisible, setModalVisible] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [form] = Form.useForm()
  const [formType, setFormType] = useState<BudgetFormType>('expense')

  const openCreateModal = (type: BudgetFormType) => {
    setEditingBudget(null)
    setFormType(type)
    setModalVisible(true)
  }

  const openEditModal = (budget: Budget) => {
    setEditingBudget(budget)
    setFormType(budget.type as BudgetFormType)
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      const payload = {
        name: values.name,
        type: formType,
        amount: values.amount,
        period: values.period,
        startDate: values.startDate?.toISOString(),
        endDate: values.endDate?.toISOString() ?? null,
        transactionTime: values.transactionTime ?? null,
        note: values.note,
        isActive: values.isActive,
        accountId: values.accountId,
        toAccountId: values.toAccountId ?? null,
        categoryId: values.categoryId,
      }

      if (editingBudget) {
        await updateBudget.mutateAsync({ id: editingBudget.id, data: payload })
        message.success('更新成功')
      } else {
        await createBudget.mutateAsync(payload)
        message.success('创建成功')
      }

      setModalVisible(false)
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      message.error(editingBudget ? '更新失败' : '创建失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteBudgetMutation.mutateAsync(id)
      message.success('删除成功')
    } catch (error) {
      message.error('删除失败')
    }
  }

  const getProgressColor = (percentage: number, isOverBudget: boolean) => {
    if (isOverBudget) return token.colorError
    if (percentage >= 80) return token.colorWarning
    return token.colorSuccess
  }

  const getStatusLabel = (type: string, percentage: number, isOverBudget: boolean) => {
    if (type === 'income') return `达成率: ${percentage.toFixed(1)}%`
    if (isOverBudget) return `超预算: ${percentage.toFixed(1)}%`
    return `使用率: ${percentage.toFixed(1)}%`
  }

  const tabItems = [
    { key: 'expense', label: '支出预算' },
    { key: 'income', label: '收入预算' },
    { key: 'transfer', label: '转账预算' },
  ]

  const modalTabItems = useMemo(() => [
    {
      key: 'expense',
      label: '支出预算',
      children: (
        <BudgetForm
          type="expense"
          editingBudget={formType === 'expense' ? editingBudget : null}
          accounts={accounts}
          categories={categories}
          form={form}
        />
      ),
    },
    {
      key: 'income',
      label: '收入预算',
      children: (
        <BudgetForm
          type="income"
          editingBudget={formType === 'income' ? editingBudget : null}
          accounts={accounts}
          categories={categories}
          form={form}
        />
      ),
    },
    {
      key: 'transfer',
      label: '转账预算',
      children: (
        <BudgetForm
          type="transfer"
          editingBudget={formType === 'transfer' ? editingBudget : null}
          accounts={accounts}
          categories={categories}
          form={form}
        />
      ),
    },
  ], [editingBudget, accounts, categories, form, formType])

  const budgetStatusMap = useMemo(() => {
    const map: Record<string, BudgetStatus> = {}
    budgetStatuses.forEach((status) => {
      map[status.budget.id] = status
    })
    return map
  }, [budgetStatuses])

  return (
    <div>
      <PageHeader
        eyebrow="Budgets"
        title="预算管理"
        description="规划未来的收入、支出和资金流动，跟踪预算执行状态"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openCreateModal(activeTab as BudgetFormType)}
          >
            新增预算
          </Button>
        }
      />

      <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
        {tabItems.map((tab) => {
          const tabBudgets = budgets.filter((b) => b.type === tab.key)
          if (tabBudgets.length === 0) return null

          return (
            <Card
              key={tab.key}
              title={
                <Space>
                  {BUDGET_TYPE_META[tab.key as keyof typeof BUDGET_TYPE_META].icon}
                  <span>{tab.label}</span>
                  <Tag>{tabBudgets.length}</Tag>
                </Space>
              }
              size="small"
            >
              <div style={{ display: 'grid', gap: token.padding }}>
                {tabBudgets.map((budget) => (
                  <BudgetCard
                    key={budget.id}
                    budget={budget}
                    status={budgetStatusMap[budget.id]}
                    token={token}
                    onEdit={() => openEditModal(budget)}
                    onDelete={() => handleDelete(budget.id)}
                    getProgressColor={getProgressColor}
                    getStatusLabel={getStatusLabel}
                  />
                ))}
              </div>
            </Card>
          )
        })}

        {budgets.length === 0 && (
          <Card>
            <Empty description="暂无预算数据" />
          </Card>
        )}
      </Space>

      <BudgetModal
        visible={modalVisible}
        title={editingBudget ? '编辑预算' : '新增预算'}
        onSubmit={handleSubmit}
        onCancel={() => setModalVisible(false)}
        submitButtonDisabled={createBudget.isPending || updateBudget.isPending}
        tabItems={modalTabItems}
        activeTab={formType}
        onTabChange={(key) => {
          setFormType(key as BudgetFormType)
          form.resetFields()
          form.setFieldsValue({
            period: 'monthly',
            isActive: true,
            startDate: dayjs(),
          })
        }}
      />
    </div>
  )
}

interface BudgetCardProps {
  budget: Budget
  status?: BudgetStatus
  token: ReturnType<typeof theme.useToken>['token']
  onEdit: () => void
  onDelete: () => void
  getProgressColor: (percentage: number, isOverBudget: boolean) => string
  getStatusLabel: (type: string, percentage: number, isOverBudget: boolean) => string
}

const BudgetCard: React.FC<BudgetCardProps> = ({
  budget,
  status,
  token,
  onEdit,
  onDelete,
  getProgressColor,
  getStatusLabel,
}) => {
  const percentage = status?.percentage ?? 0
  const isOverBudget = status?.isOverBudget ?? false
  const used = status?.used ?? 0

  return (
    <Card size="small" style={{ background: token.colorBgLayout }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: token.paddingSM }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space wrap>
            <Text strong style={{ fontSize: 16 }}>{budget.name}</Text>
            <Tag>{PERIOD_LABELS[budget.period] ?? budget.period}</Tag>
            {budget.transactionTime !== null && budget.period !== 'daily' && (
              <Tag color="blue">
                {budget.period === 'weekly'
                  ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][budget.transactionTime]
                  : budget.period === 'monthly'
                    ? `每月${budget.transactionTime}日`
                    : `第${budget.transactionTime}天`
                }
              </Tag>
            )}
            {!budget.isActive && <Tag color="default">已停用</Tag>}
          </Space>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {budget.category?.name}
            </Text>
          </div>
          {budget.note && (
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{budget.note}</Text>
            </div>
          )}
        </div>
        <Space size="small">
          <Text strong style={{ color: token.colorPrimary, fontSize: 16 }}>
            ¥{budget.amount.toFixed(2)}
          </Text>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={onEdit}
          />
          <Popconfirm
            title="确定删除此预算？"
            onConfirm={onDelete}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>

      <Progress
        percent={Math.min(percentage, 100)}
        status={isOverBudget ? 'exception' : undefined}
        strokeColor={getProgressColor(percentage, isOverBudget)}
        format={() => getStatusLabel(budget.type, percentage, isOverBudget)}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: token.paddingXS, color: token.colorTextSecondary }}>
        <span>
          已{budget.type === 'income' ? '达成' : budget.type === 'transfer' ? '流转' : '使用'}: ¥{used.toFixed(2)}
        </span>
        <span>
          剩余: ¥{Math.max(budget.amount - used, 0).toFixed(2)}
        </span>
      </div>
    </Card>
  )
}

export default Budgets
