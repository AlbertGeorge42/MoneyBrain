import React, { useState, useMemo } from 'react'
import {
  Button, Card, Progress, Space, Tag, Empty, theme,
  Typography, Form, Switch,
} from 'antd'
import {
  PlusOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SwapOutlined,
} from '@ant-design/icons'
import { PageHeader } from '../components/common'
import { BudgetModal, BudgetForm, BudgetFormType, BudgetEdit } from '../components/budgets'
import { useNotify } from '../hooks/useNotify'
import {
  useBudgets,
  useBudgetStatuses,
  useCreateBudget,
  useUpdateBudget,
  usePatchBudget,
  useDeleteBudget,
  useAccounts,
  useTransactionCategories,
} from '../queries'
import type { Budget, BudgetStatus } from '@shared/types'
import dayjs from 'dayjs'
import { formatCurrency, formatPercent } from '../utils/format'
import { useAmountColors } from '../constants/transactionType'

const { Text } = Typography

// 预算进度条固定色相：收入=绿、支出=红、转账=蓝
const BUDGET_PROGRESS_HUES: Record<string, number> = {
  income: 100,
  expense: 0,
  transfer: 209,
}

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
  const patchBudget = usePatchBudget()
  const deleteBudgetMutation = useDeleteBudget()

  const [activeTab] = useState<string>('expense')
  // 新建预算弹窗
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [createForm] = Form.useForm()
  const [createFormType, setCreateFormType] = useState<BudgetFormType>('expense')
  // 编辑预算弹窗
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null)

  const openCreateModal = (type: BudgetFormType) => {
    setCreateFormType(type)
    setCreateModalVisible(true)
  }

  const openEditModal = (budget: Budget) => {
    setSelectedBudget(budget)
    setEditModalVisible(true)
  }

  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields()
      const payload = {
        name: values.name,
        type: createFormType,
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
      await createBudget.mutateAsync(payload)
      notify.success('创建成功')
      setCreateModalVisible(false)
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      notify.error('创建失败')
    }
  }

  const handleEditSubmit = async (values: unknown) => {
    if (!selectedBudget) return
    try {
      await updateBudget.mutateAsync({ id: selectedBudget.id, data: values as Record<string, unknown> })
      notify.success('更新成功')
    } catch {
      notify.error('更新失败')
    }
  }

  const handleDelete = async () => {
    if (!selectedBudget) return
    try {
      await deleteBudgetMutation.mutateAsync(selectedBudget.id)
      notify.success('删除成功')
    } catch {
      notify.error('删除失败')
    }
  }

  const handleToggleActive = async (budget: Budget, active: boolean) => {
    try {
      await patchBudget.mutateAsync({ id: budget.id, data: { isActive: active } })
      notify.success(active ? '已启用' : '已停用')
    } catch {
      notify.error('操作失败')
    }
  }

  const getProgressColor = (type: string, percentage: number, isOverBudget: boolean) => {
    const hue = BUDGET_PROGRESS_HUES[type] ?? 209
    if (isOverBudget) {
      // 超预算：最高饱和度，深色
      return `hsla(${hue}, 85%, 45%, 1)`
    }
    // 百分比越高 → 饱和度越高、亮度越低
    const sat = 55 + percentage * 0.3   // 55% → 85%
    const light = 72 - percentage * 0.27 // 72% → 45%
    return `hsla(${hue}, ${Math.round(sat)}%, ${Math.round(light)}%, 1)`
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

  const createModalTabItems = useMemo(() => [
    {
      key: 'expense',
      label: '支出预算',
      children: (
        <BudgetForm
          type="expense"
          accounts={accounts}
          categories={categories}
          form={createForm}
        />
      ),
    },
    {
      key: 'income',
      label: '收入预算',
      children: (
        <BudgetForm
          type="income"
          accounts={accounts}
          categories={categories}
          form={createForm}
        />
      ),
    },
    {
      key: 'transfer',
      label: '转账预算',
      children: (
        <BudgetForm
          type="transfer"
          accounts={accounts}
          categories={categories}
          form={createForm}
        />
      ),
    },
  ], [accounts, categories, createForm])

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
                    onClick={() => openEditModal(budget)}
                    onToggleActive={(active) => handleToggleActive(budget, active)}
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

      {/* 新建预算弹窗 */}
      <BudgetModal
        visible={createModalVisible}
        title="新增预算"
        onSubmit={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
        submitButtonDisabled={createBudget.isPending}
        tabItems={createModalTabItems}
        activeTab={createFormType}
        onTabChange={(key) => {
          setCreateFormType(key as BudgetFormType)
          createForm.resetFields()
          createForm.setFieldsValue({
            period: 'monthly',
            dateRange: [dayjs(), null],
          })
        }}
      />

      {/* 编辑/删除预算弹窗 */}
      <BudgetEdit
        visible={editModalVisible}
        budget={selectedBudget}
        accounts={accounts}
        categories={categories}
        onEdit={handleEditSubmit}
        onDelete={handleDelete}
        onCancel={() => setEditModalVisible(false)}
      />
    </div>
  )
}

interface BudgetCardProps {
  budget: Budget
  status?: BudgetStatus
  token: ReturnType<typeof theme.useToken>['token']
  onClick: () => void
  onToggleActive: (active: boolean) => void
  getProgressColor: (type: string, percentage: number, isOverBudget: boolean) => string
  getStatusLabel: (type: string, percentage: number, isOverBudget: boolean) => string
}

const BudgetCard: React.FC<BudgetCardProps> = ({
  budget,
  status,
  token,
  onClick,
  onToggleActive,
  getProgressColor,
  getStatusLabel,
}) => {
  const percentage = status?.percentage ?? 0
  const isOverBudget = status?.isOverBudget ?? false
  const used = status?.used ?? 0
  const amountColors = useAmountColors()

  // 根据预算类型获取金额颜色
  const getBudgetAmountColor = () => {
    if (!budget.isActive) return token.colorTextSecondary
    switch (budget.type) {
      case 'income':
        return amountColors.positive
      case 'expense':
        return amountColors.negative
      case 'transfer':
        return amountColors.neutral
      default:
        return amountColors.neutral
    }
  }

  // 停用状态下进度条变灰
  const getProgressStrokeColor = () => {
    if (!budget.isActive) return token.colorFillSecondary
    return getProgressColor(budget.type, percentage, isOverBudget)
  }

  return (
    <Card
      size="small"
      style={{
        background: budget.isActive ? token.colorBgLayout : token.colorBgContainerDisabled,
        cursor: 'pointer',
        opacity: budget.isActive ? 1 : 0.85,
      }}
      onClick={onClick}
    >
      {/* 第一行：名称、周期、金额、开关 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: token.paddingSM }}>
        <Space wrap size={12} align="center">
          <Text strong style={{ fontSize: 15, color: budget.isActive ? token.colorText : token.colorTextSecondary, lineHeight: '22px' }}>
            {budget.name}
          </Text>
          <Tag style={{ lineHeight: '20px' }}>{PERIOD_LABELS[budget.period] ?? budget.period}</Tag>
        </Space>
        <Space size={8} align="center">
          <Text strong style={{ color: getBudgetAmountColor(), fontSize: 15, fontVariantNumeric: 'tabular-nums', lineHeight: '22px' }}>
            {formatCurrency(budget.amount)}
          </Text>
          <Switch
            size="small"
            style={{ transform: 'scale(0.8)', verticalAlign: 'middle' }}
            checked={budget.isActive}
            onChange={(checked, e) => {
              e.stopPropagation()
              onToggleActive(checked)
            }}
            onClick={(_checked, e) => e.stopPropagation()}
          />
        </Space>
      </div>

      {/* 进度条 */}
      <Progress
        className="budget-progress"
        percent={Math.min(percentage, 100)}
        strokeColor={getProgressStrokeColor()}
        format={() => getStatusLabel(budget.type, percentage, isOverBudget)}
      />

      {/* 底部：已使用、剩余 */}
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