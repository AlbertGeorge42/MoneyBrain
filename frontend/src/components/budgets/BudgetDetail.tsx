import React from 'react'
import { Button, Space, Tag, Divider, Typography, Modal, Progress, theme } from 'antd'
import { EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { formatCurrency, formatPercent } from '../../utils/format'
import { useAmountColors, TRANSACTION_TYPE_CONFIG } from '../../constants/transactionType'
import type { Budget, BudgetStatus } from '@shared/types'

const { Text } = Typography

const PERIOD_LABELS: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '月度',
  quarterly: '季度',
  yearly: '年度',
}

const BUDGET_TYPE_META = {
  income: { label: '收入预算' },
  expense: { label: '支出预算' },
  transfer: { label: '转账预算' },
} as const

interface BudgetDetailProps {
  budget: Budget
  status?: BudgetStatus
}

/** 预算详情底部操作按钮（用于 Drawer footer） */
export interface BudgetDetailFooterProps {
  onEdit: () => void
  onDelete: () => Promise<void>
  isDeleting?: boolean
}

export const BudgetDetailFooter: React.FC<BudgetDetailFooterProps> = ({
  onEdit,
  onDelete,
  isDeleting = false,
}) => {
  const { token } = theme.useToken()

  const handleDeleteConfirm = async () => {
    await onDelete()
  }

  const showDeleteConfirm = () => {
    Modal.confirm({
      title: '确定要删除此预算吗？',
      content: '此操作不可撤销',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true, loading: isDeleting },
      onOk: handleDeleteConfirm,
    })
  }

  return (
    <Space direction="vertical" size={token.padding} style={{ width: '100%' }}>
      <Button
        icon={<EditOutlined />}
        onClick={onEdit}
        block
        size="large"
      >
        编辑
      </Button>

      <Button
        danger
        icon={<DeleteOutlined />}
        onClick={showDeleteConfirm}
        block
        size="large"
      >
        删除
      </Button>
    </Space>
  )
}

/**
 * 预算详情组件
 *
 * 渐进式披露层次：
 * - 第1层：核心信息（名称、金额、进度条、周期）
 * - 第2层：次要信息（账户、分类、日期范围、备注）
 *
 * 操作按钮通过 BudgetDetailFooter 单独渲染在抽屉底部
 */
const BudgetDetail: React.FC<BudgetDetailProps> = ({
  budget,
  status,
}) => {
  const { token } = theme.useToken()
  const amountColors = useAmountColors()

  const percentage = status?.percentage ?? 0
  const used = status?.used ?? 0
  const isOverBudget = status?.isOverBudget ?? false
  const typeMeta = BUDGET_TYPE_META[budget.type as keyof typeof BUDGET_TYPE_META]

  const getBudgetAmountColor = () => {
    if (!budget.isActive) return token.colorTextSecondary
    switch (budget.type) {
      case 'income':
        return amountColors.positive
      case 'expense':
        return amountColors.negative
      default:
        return amountColors.neutral
    }
  }

  const getProgressColor = () => {
    if (!budget.isActive) return token.colorFillSecondary
    if (budget.type === 'income') return 'var(--mb-color-income)'
    if (budget.type === 'expense') return 'var(--mb-color-expense)'
    return 'var(--mb-color-neutral)'
  }

  const getStatusLabel = () => {
    if (budget.type === 'income') {
      return isOverBudget ? `超额完成: ${formatPercent(percentage, 1, false)}` : `达成率: ${formatPercent(percentage, 1, false)}`
    }
    if (budget.type === 'transfer') {
      return isOverBudget ? `超预算: ${formatPercent(percentage, 1, false)}` : `流转率: ${formatPercent(percentage, 1, false)}`
    }
    return isOverBudget ? `超预算: ${formatPercent(percentage, 1, false)}` : `使用率: ${formatPercent(percentage, 1, false)}`
  }

  return (
    <div>
      {/* 第1层：核心信息 */}
      <div style={{ textAlign: 'center', marginBottom: token.paddingLG }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: token.colorText, marginBottom: token.paddingXS }}>
          {budget.name}
        </div>
        <div style={{ fontSize: 32, fontWeight: 600, color: getBudgetAmountColor(), margin: `${token.paddingSM}px 0`, fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(budget.amount)}
        </div>
        <Space size={4} wrap style={{ justifyContent: 'center' }}>
          <Tag color={TRANSACTION_TYPE_CONFIG[budget.type as keyof typeof TRANSACTION_TYPE_CONFIG]?.color}>{typeMeta?.label}</Tag>
          {!budget.isActive && <Tag>已停用</Tag>}
        </Space>
      </div>

      {/* 进度条 */}
      <div style={{ marginBottom: token.paddingLG }}>
        <Progress
          percent={Math.min(percentage, 100)}
          strokeColor={getProgressColor()}
          format={() => getStatusLabel()}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: token.paddingXS, color: token.colorTextSecondary, fontVariantNumeric: 'tabular-nums' }}>
          <span>
            已{budget.type === 'income' ? '达成' : budget.type === 'transfer' ? '流转' : '使用'}: {formatCurrency(used)}
          </span>
          <span>
            剩余: {formatCurrency(Math.max(budget.amount - used, 0))}
          </span>
        </div>
      </div>

      <Divider style={{ margin: `${token.padding}px 0` }} />

      {/* 第2层：次要信息（统一顺序：账户 → 分类 → 周期 → 时间 → 交易日 → 备注） */}
      <Space direction="vertical" size={token.padding} style={{ width: '100%' }}>
        {budget.account && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">账户</Text>
            <Text>{budget.account.name}</Text>
          </div>
        )}

        {budget.category && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">分类</Text>
            <Text>{budget.category.name}</Text>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">周期</Text>
          <Text>{PERIOD_LABELS[budget.period] ?? budget.period}</Text>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">时间</Text>
          <Text>
            {budget.endDate
              ? `${budget.startDate ? new Date(budget.startDate).toLocaleDateString() : ''} ~ ${new Date(budget.endDate).toLocaleDateString()}`
              : '长期'}
          </Text>
        </div>

        {budget.transactionTime != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">交易日</Text>
            <Text>{budget.period === 'weekly' ? PERIOD_LABELS[`day${budget.transactionTime}`] ?? `周${budget.transactionTime + 1}` : `第${budget.transactionTime}天`}</Text>
          </div>
        )}

        {budget.note && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">备注</Text>
            <Text>{budget.note}</Text>
          </div>
        )}
      </Space>
    </div>
  )
}

export default BudgetDetail