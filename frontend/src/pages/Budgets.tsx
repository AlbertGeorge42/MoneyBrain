import React, { useState, useMemo } from 'react'
import {
  Button, Card, Progress, Space, Tag, Empty, theme,
  Typography, Form, Switch, Segmented,
} from 'antd'
import {
  PlusOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SwapOutlined,
} from '@ant-design/icons'
import { PageHeader } from '../components/common'
import { ResponsiveDrawer } from '../components/common'
import { BudgetForm, BudgetFormType } from '../components/budgets'
import BudgetDetail, { BudgetDetailFooter } from '../components/budgets/BudgetDetail'
import BudgetEdit from '../components/budgets/BudgetEdit'
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
import { formatCurrency } from '../utils/format'
import { getProgressColor, getStatusLabel } from '../utils/budget'
import { useAmountColors } from '../hooks/useAmountColors'

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

  // 新建预算状态
  const [createVisible, setCreateVisible] = useState(false)
  const [createForm] = Form.useForm()
  const [createFormType, setCreateFormType] = useState<BudgetFormType>('expense')

  // 详情/编辑状态
  const [detailVisible, setDetailVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null)

  // 预算状态映射
  const budgetStatusMap = useMemo(() => {
    const map: Record<string, BudgetStatus> = {}
    budgetStatuses.forEach((status) => {
      map[status.budget.id] = status
    })
    return map
  }, [budgetStatuses])

  // 打开新建弹窗
  const openCreateModal = (type: BudgetFormType) => {
    setCreateFormType(type)
    setCreateVisible(true)
  }

  // 点击预算卡片 → 打开详情抽屉
  const handleCardClick = (budget: Budget) => {
    setSelectedBudget(budget)
    setDetailVisible(true)
    setEditVisible(false)
  }

  // 从详情切换到编辑
  const handleEditFromDetail = () => {
    setDetailVisible(false)
    setEditVisible(true)
  }

  // 从编辑返回详情
  const handleBackToDetail = () => {
    setEditVisible(false)
    setDetailVisible(true)
  }

  // 关闭所有抽屉
  const handleCloseAll = () => {
    setDetailVisible(false)
    setEditVisible(false)
    setSelectedBudget(null)
  }

  // 新建提交
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields()
      const payload = {
        name: values.name,
        type: createFormType,
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
      await createBudget.mutateAsync(payload)
      notify.success('创建成功')
      setCreateVisible(false)
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      notify.error('创建失败')
    }
  }

  // 编辑提交
  const handleEditSubmit = async (values: unknown) => {
    if (!selectedBudget) return
    try {
      await updateBudget.mutateAsync({ id: selectedBudget.id, data: values as Record<string, unknown> })
      notify.success('更新成功')
      handleCloseAll()
    } catch {
      notify.error('更新失败')
    }
  }

  // 删除确认
  const handleDelete = async () => {
    if (!selectedBudget) return
    try {
      await deleteBudgetMutation.mutateAsync(selectedBudget.id)
      notify.success('删除成功')
      handleCloseAll()
    } catch {
      notify.error('删除失败')
    }
  }

  // 切换预算状态
  const handleToggleActive = async (budget: Budget, active: boolean) => {
    try {
      await updateBudget.mutateAsync({ id: budget.id, data: { isActive: active } })
      notify.success(active ? '已启用' : '已停用')
    } catch {
      notify.error('操作失败')
    }
  }

  const tabItems = [
    { key: 'expense', label: '支出预算' },
    { key: 'income', label: '收入预算' },
    { key: 'transfer', label: '转账预算' },
  ]

  // 新建抽屉的 Segmented 选项
  const createFormTypeOptions = [
    { label: '支出', value: 'expense' },
    { label: '收入', value: 'income' },
    { label: '转账', value: 'transfer' },
  ]

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
            onClick={() => openCreateModal(createFormType)}
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
                  <Tag variant="outlined">{tabBudgets.length}</Tag>
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
                    onClick={() => handleCardClick(budget)}
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

      {/* 新建预算抽屉 */}
      <ResponsiveDrawer
        visible={createVisible}
        title="新增预算"
        onCancel={() => setCreateVisible(false)}
      >
        <Segmented
          value={createFormType}
          onChange={(value) => {
            setCreateFormType(value as BudgetFormType)
            createForm.resetFields()
            createForm.setFieldsValue({
              period: 'monthly',
              startDate: dayjs(),
              endDate: null,
              isLongTerm: false,
            })
          }}
          options={createFormTypeOptions}
          style={{ marginBottom: 24 }}
          block
        />

        <BudgetForm
          type={createFormType}
          accounts={accounts}
          categories={categories}
          form={createForm}
        />

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <Button onClick={() => setCreateVisible(false)} size="large" style={{ flex: 1 }}>
            取消
          </Button>
          <Button
            type="primary"
            onClick={handleCreateSubmit}
            loading={createBudget.isPending}
            size="large"
            style={{ flex: 2 }}
          >
            确定
          </Button>
        </div>
      </ResponsiveDrawer>

      {/* 详情抽屉 */}
      {selectedBudget && (
        <ResponsiveDrawer
          visible={detailVisible}
          title="预算详情"
          onCancel={handleCloseAll}
          footer={
            <BudgetDetailFooter
              onEdit={handleEditFromDetail}
              onDelete={handleDelete}
              isDeleting={deleteBudgetMutation.isPending}
            />
          }
        >
          <BudgetDetail
            budget={selectedBudget}
            status={budgetStatusMap[selectedBudget.id]}
          />
        </ResponsiveDrawer>
      )}

      {/* 编辑抽屉 */}
      <BudgetEdit
        visible={editVisible}
        budget={selectedBudget}
        accounts={accounts}
        categories={categories}
        onEdit={handleEditSubmit}
        onCancel={handleCloseAll}
        onBack={handleBackToDetail}
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
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        // 仅当焦点在卡片自身时处理，避免嵌套控件（如 Switch）按键冒泡导致双重触发
        if (e.target !== e.currentTarget) return
        // Enter/Space 触发与点击相同的逻辑；Space 需 preventDefault 防止页面滚动
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: token.paddingSM }}>
        <Space wrap size={12} align="center">
          <Text strong style={{ fontSize: 15, color: budget.isActive ? token.colorText : token.colorTextSecondary, lineHeight: '22px' }}>
            {budget.name}
          </Text>
          <Tag variant="outlined">{PERIOD_LABELS[budget.period] ?? budget.period}</Tag>
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

      <Progress
        className="budget-progress"
        percent={Math.min(percentage, 100)}
        strokeColor={getProgressStrokeColor()}
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