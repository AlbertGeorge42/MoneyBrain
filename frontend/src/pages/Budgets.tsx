import React, { useState, useMemo } from 'react'
import {
  Button, Card, Progress, Space, Tag, Empty, theme,
  Typography, Popconfirm, Form,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SwapOutlined,
} from '@ant-design/icons'
import { PageHeader } from '../components/common'
import { BudgetModal, BudgetForm, BudgetFormType } from '../components/budgets'
import { useNotify } from '../hooks/useNotify'
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
import { formatCurrency, formatPercent } from '../utils/format'
import { AMOUNT_COLORS } from '../constants/transactionType'

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
  const notify = useNotify()

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
        notify.success('更新成功')
      } else {
        await createBudget.mutateAsync(payload)
        notify.success('创建成功')
      }

      setModalVisible(false)
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      notify.error(editingBudget ? '更新失败' : '创建失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteBudgetMutation.mutateAsync(id)
      notify.success('删除成功')
    } catch {
      notify.error('删除失败')
    }
  }

  const getProgressColor = (type: string, percentage: number, isOverBudget: boolean) => {
    // 收入预算超额完成是好事，用绿色
    if (type === 'income' && isOverBudget) return token.colorSuccess
    // 支出/转账预算超预算是坏事，用红色
    if (isOverBudget) return token.colorError
    if (percentage >= 80) return token.colorWarning
    return token.colorSuccess
  }

  const getStatusLabel = (type: string, percentage: number, isOverBudget: boolean) => {
    if (type === 'income') {
      // 收入预算：达成率，超额完成显示"超额完成"
      return isOverBudget ? `超额完成: ${formatPercent(percentage, 1, false)}` : `达成率: ${formatPercent(percentage, 1, false)}`
    }
    if (type === 'transfer') {
      // 转账预算：流转率
      return isOverBudget ? `超预算: ${formatPercent(percentage, 1, false)}` : `流转率: ${formatPercent(percentage, 1, false)}`
    }
    // 支出预算：使用率
    return isOverBudget ? `超预算: ${formatPercent(percentage, 1, false)}` : `使用率: ${formatPercent(percentage, 1, false)}`
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

  // 根据预算类型获取金额颜色
  const getBudgetAmountColor = () => {
    switch (budget.type) {
      case 'income':
        return AMOUNT_COLORS.positive
      case 'expense':
        return AMOUNT_COLORS.negative
      case 'transfer':
        return AMOUNT_COLORS.neutral
      default:
        return AMOUNT_COLORS.neutral
    }
  }

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
          <Text strong style={{ color: getBudgetAmountColor(), fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(budget.amount)}
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
        status={isOverBudget && budget.type !== 'income' ? 'exception' : undefined}
        strokeColor={getProgressColor(budget.type, percentage, isOverBudget)}
        format={() => getStatusLabel(budget.type, percentage, isOverBudget)}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: token.paddingXS, color: token.colorTextSecondary, fontVariantNumeric: 'tabular-nums' }}>
        <span>
          已{budget.type === 'income' ? '达成' : budget.type === 'transfer' ? '流转' : '使用'}: {formatCurrency(used)}
        </span>
        <span>
          剩余: {formatCurrency(Math.max(budget.amount - used, 0))}
        </span>
      </div>
    </Card>
  )
}

export default Budgets
