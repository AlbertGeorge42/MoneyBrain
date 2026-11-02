import React from 'react'
import { Button, Space, Tag, Divider, Typography, Skeleton, Empty, theme } from 'antd'
import { EditOutlined, RollbackOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons'
import type { AuditEvent, Transaction } from '../../services/api'
import { useTransactionHistory } from '../../queries'
import { useAmountColors } from '../../hooks/useAmountColors'
import { TRANSACTION_TYPE_CONFIG } from '../../utils/transactionType'
import { formatCurrency } from '../../utils/format'
import { minor } from '@domain/index'
import { getCategoryName, getAccountName } from './TransactionItemRow'
import dayjs from 'dayjs'

const { Text } = Typography

interface TransactionDetailProps {
  transaction: Transaction
}

/** 交易详情底部操作按钮（用于 Drawer footer） */
export interface TransactionDetailFooterProps {
  transactionType: string
  onEdit: () => void
  onRefund?: () => void
  onDelete: () => Promise<void>
  isDeleting?: boolean
}

export const TransactionDetailFooter: React.FC<TransactionDetailFooterProps> = ({
  transactionType,
  onEdit,
  onRefund,
  onDelete,
  isDeleting = false,
}) => {
  const { token } = theme.useToken()
  const canRefund = transactionType === 'income' || transactionType === 'expense'

  // 软删除（B2-3）：不做二次确认，删除后由 useDeleteTransaction 统一提示「已删除 · 撤销」
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

      {canRefund && onRefund && (
        <Button
          icon={<RollbackOutlined />}
          onClick={onRefund}
          block
          size="large"
        >
          退款
        </Button>
      )}

      <Button
        danger
        icon={<DeleteOutlined />}
        onClick={() => { void onDelete() }}
        loading={isDeleting}
        block
        size="large"
      >
        删除
      </Button>
    </Space>
  )
}

// ===== 修改历史（B2-4） =====

/** 审计动作的展示名与标签色 */
const ACTION_META: Record<string, { label: string; color: string }> = {
  updated: { label: '修改', color: 'blue' },
  deleted: { label: '删除', color: 'red' },
  restored: { label: '恢复', color: 'green' },
}

/** 直接可读的字段对比；账户/分类只提示「已变更」（详情抽屉没有现成的名称字典）。 */
const DIFF_FIELDS: Array<{ key: string; label: string; format?: (value: unknown) => string }> = [
  { key: 'type', label: '类型' },
  { key: 'amount', label: '金额', format: (value) => formatCurrency(minor(Number(value))) },
  { key: 'fee', label: '手续费', format: (value) => formatCurrency(minor(Number(value))) },
  { key: 'coupon', label: '优惠券', format: (value) => formatCurrency(minor(Number(value))) },
  { key: 'date', label: '日期' },
  { key: 'note', label: '备注' },
  { key: 'excludeFromIncomeExpense', label: '计收支标记' },
]

function parseSnapshot(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    const parsed: unknown = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 把一条 updated 事件的 before/after 对比成「字段：原值 → 新值」列表。 */
function describeChanges(event: AuditEvent): string[] {
  const before = parseSnapshot(event.beforeJson)
  const after = parseSnapshot(event.afterJson)
  if (!before || !after) return []

  const changes: string[] = []
  for (const field of DIFF_FIELDS) {
    const from = before[field.key]
    const to = after[field.key]
    if (from === to) continue
    const format = field.format ?? ((value: unknown) => String(value ?? '（空）'))
    changes.push(`${field.label}：${format(from)} → ${format(to)}`)
  }
  if (before.accountId !== after.accountId) changes.push('账户已变更')
  if (before.categoryId !== after.categoryId) changes.push('分类已变更')
  return changes
}

/** 详情抽屉里的修改历史区块。 */
const TransactionHistorySection: React.FC<{ transactionId: string }> = ({ transactionId }) => {
  const { token } = theme.useToken()
  const historyQuery = useTransactionHistory(transactionId)

  if (historyQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 2 }} />
  }
  if (historyQuery.isError) {
    return <Text type="secondary">修改历史加载失败</Text>
  }

  const events = historyQuery.data?.list ?? []
  if (events.length === 0) {
    return <Empty description="暂无修改记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <Space direction="vertical" size={token.paddingXS} style={{ width: '100%' }}>
      {events.map((event) => {
        const meta = ACTION_META[event.action] ?? { label: event.action, color: 'default' }
        const changes = event.action === 'updated' ? describeChanges(event) : []
        return (
          <div
            key={event.id}
            style={{
              padding: `${token.paddingXS}px ${token.paddingSM}px`,
              backgroundColor: token.colorFillQuaternary,
              borderRadius: token.borderRadius,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Tag variant="outlined" color={meta.color}>{meta.label}</Tag>
              <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {dayjs(event.at).format('YYYY-MM-DD HH:mm')}
              </Text>
            </div>
            {changes.length > 0 && (
              <div style={{ marginTop: token.marginXXS }}>
                {changes.map((change) => (
                  <Text key={change} type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
                    {change}
                  </Text>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </Space>
  )
}

/**
 * 交易详情组件
 * 在抽屉中展示交易完整信息
 *
 * 渐进式披露层次：
 * - 第1层：核心信息（图标、金额、分类、日期）
 * - 第2层：次要信息（账户、备注、关联信息）
 * - 第3层：退款/原交易关联信息（双向展示）
 *
 * 操作按钮通过 TransactionDetailFooter 单独渲染在抽屉底部
 */
const TransactionDetail: React.FC<TransactionDetailProps> = ({
  transaction,
}) => {
  const { token } = theme.useToken()
  const amountColors = useAmountColors()
  const typeConfig = TRANSACTION_TYPE_CONFIG[transaction.type as keyof typeof TRANSACTION_TYPE_CONFIG]

  const categoryName = getCategoryName(transaction)
  const accountName = getAccountName(transaction)

  const amountColor = (() => {
    switch (transaction.type) {
      case 'income':
      case 'refund':
        return amountColors.positive
      case 'expense':
        return amountColors.negative
      default:
        return amountColors.neutral
    }
  })()

  const displayAmount = (() => {
    switch (transaction.type) {
      case 'income':
        return formatCurrency(transaction.amount, { showSign: true })
      case 'expense':
        return formatCurrency(minor(-transaction.amount), { showSign: true })
      case 'refund':
        return formatCurrency(transaction.amount, { showSign: true })
      case 'transfer':
        return formatCurrency(transaction.amount)
      default:
        return formatCurrency(transaction.amount)
    }
  })()

  const canRefund = transaction.type === 'income' || transaction.type === 'expense'

  const hasFee = transaction.fee && Number(transaction.fee) > 0
  const hasCoupon = transaction.coupon && Number(transaction.coupon) > 0

  // 基础信息行（统一顺序：账户 → 时间 → 手续费/优惠券 → 备注）
  // 分类已在核心信息区展示，转入账户信息已并入账户行
  const infoRows: Array<{ label: string; content: React.ReactNode }> = [
    { label: '账户', content: <Text>{accountName}</Text> },
    { label: '时间', content: <Text>{dayjs(transaction.date).format('YYYY-MM-DD')}</Text> },
  ]

  if (transaction.excludeFromIncomeExpense) {
    infoRows.push({
      label: '标记',
      content: <Text>不计收支</Text>,
    })
  }

  if (hasFee) {
    infoRows.push({ label: '手续费', content: <Text>{formatCurrency(transaction.fee)}</Text> })
  }

  if (hasCoupon) {
    infoRows.push({ label: '优惠券', content: <Text>{formatCurrency(transaction.coupon)}</Text> })
  }

  if (transaction.note) {
    infoRows.push({ label: '备注', content: <Text>{transaction.note}</Text> })
  }

  // 判断是否显示退款关联区域
  const isRefund = transaction.type === 'refund'
  const isOriginal = canRefund && transaction.refunds && transaction.refunds.length > 0
  const showRefundSection = isRefund || isOriginal

  return (
    <div>
      {/* 第1层：核心信息（名称 → 金额 → 类型 Tag） */}
      <div style={{ textAlign: 'center', marginBottom: token.paddingLG }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: token.colorText, marginBottom: token.paddingXS }}>
          {categoryName}
        </div>
        <div style={{ fontSize: 32, fontWeight: 600, color: amountColor, margin: `${token.paddingSM}px 0`, fontVariantNumeric: 'tabular-nums' }}>
          {displayAmount}
        </div>
        <Space size={4} wrap style={{ justifyContent: 'center' }}>
          <Tag variant="outlined" color={typeConfig?.tagColor}>{typeConfig?.text}</Tag>
        </Space>
      </div>

      <Divider style={{ margin: `${token.padding}px 0` }} />

      {/* 第2层：次要信息 */}
      <Space direction="vertical" size={token.padding} style={{ width: '100%' }}>
        {infoRows.map((row) => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">{row.label}</Text>
            {row.content}
          </div>
        ))}
      </Space>

      {/* 第3层：退款/原交易关联信息（双向展示） */}
      {showRefundSection && (
        <>
          <Divider style={{ margin: `${token.paddingLG}px 0` }} />

          {isRefund && transaction.relatedTransaction && (
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: token.paddingSM, fontSize: token.fontSizeSM }}>
                原交易
              </Text>
              <div
                style={{
                  padding: `${token.paddingSM}px ${token.padding}px`,
                  backgroundColor: token.colorFillQuaternary,
                  borderRadius: token.borderRadius,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text>{transaction.relatedTransaction.category?.name || '未分类'}</Text>
                  <Text style={{ color: amountColors.negative, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(transaction.relatedTransaction.amount)}
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {dayjs(transaction.relatedTransaction.date).format('YYYY-MM-DD')}
                  </Text>
                  {transaction.relatedTransaction.account && (
                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      {transaction.relatedTransaction.account.name}
                    </Text>
                  )}
                </div>
              </div>
            </div>
          )}

          {isOriginal && transaction.refunds && (
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: token.paddingSM, fontSize: token.fontSizeSM }}>
                退款记录 ({transaction.refunds.length})
              </Text>
              {transaction.refunds.map((refund) => (
                <div
                  key={refund.id}
                  style={{
                    padding: `${token.paddingSM}px ${token.padding}px`,
                    backgroundColor: token.colorFillQuaternary,
                    borderRadius: token.borderRadius,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    marginBottom: token.paddingXS,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>退款</Text>
                    <Text style={{ color: amountColors.positive, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(refund.amount)}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      {dayjs(refund.date).format('YYYY-MM-DD')}
                    </Text>
                    {refund.account && (
                      <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                        {refund.account.name}
                      </Text>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 第4层：修改历史（B2-4） */}
      <Divider style={{ margin: `${token.paddingLG}px 0` }} />
      <div>
        <Text type="secondary" style={{ display: 'block', marginBottom: token.paddingSM, fontSize: token.fontSizeSM }}>
          <HistoryOutlined style={{ marginRight: 4 }} />
          修改历史
        </Text>
        <TransactionHistorySection transactionId={transaction.id} />
      </div>
    </div>
  )
}

export default TransactionDetail