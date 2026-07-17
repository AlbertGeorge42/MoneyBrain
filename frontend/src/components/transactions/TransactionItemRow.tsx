import React from 'react'
import { CategoryIcon } from '../common'
import type { Transaction } from '../../services/api'
import { AMOUNT_COLORS, TRANSACTION_TYPE_CONFIG } from '../../constants/transactionType'
import { formatCurrency } from '../../utils/format'

/**
 * 获取交易分类的显示名称
 */
export const getCategoryName = (record: Transaction): string => {
  if (record.type === 'adjustment') return record.note || '平账'
  if (record.type === 'transfer') return record.category?.name || '内部转账'
  if (record.type === 'refund') {
    const original = record.relatedTransaction?.category?.name || ''
    return original || '退款'
  }
  return record.category?.name || '未分类'
}

/**
 * 获取交易账户的显示名称
 */
export const getAccountName = (record: Transaction): string => {
  if (record.type === 'transfer') {
    const from = record.account?.name || ''
    const to = record.toAccount?.name || ''
    return `${from} → ${to}`
  }
  return record.account?.name || ''
}

interface TransactionItemRowProps {
  transaction: Transaction
  /** 是否显示账户名（默认 true） */
  showAccount?: boolean
  /** 是否显示备注（默认 true） */
  showNote?: boolean
  /** 点击回调 */
  onClick?: () => void
  /** 图标容器尺寸，默认 24 */
  iconSize?: number
  /** 图标尺寸，默认 14 */
  iconNameSize?: number
  /** 额外 className */
  className?: string
}

/**
 * 统一的交易行组件
 * - 左侧：3px 竖条色带（交易类型色）+ CategoryIcon
 * - 中间：分类名称 + 备注
 * - 右侧：金额 + 账户名
 *
 * 用于 TransactionTable（分组交易列表）和 Dashboard（最近交易），
 * 保持两个页面交易行视觉风格一致。
 */
const TransactionItemRow: React.FC<TransactionItemRowProps> = ({
  transaction,
  showAccount = true,
  showNote = true,
  onClick,
  iconSize = 24,
  iconNameSize = 14,
  className,
}) => {
  const typeConfig = TRANSACTION_TYPE_CONFIG[transaction.type as keyof typeof TRANSACTION_TYPE_CONFIG]
  const categoryName = getCategoryName(transaction)
  const accountName = getAccountName(transaction)
  const note = showNote ? transaction.note : null

  // 金额颜色
  const amountColor = (() => {
    switch (transaction.type) {
      case 'income':
      case 'refund':
        return AMOUNT_COLORS.positive
      case 'expense':
        return AMOUNT_COLORS.negative
      default:
        return AMOUNT_COLORS.neutral
    }
  })()

  // 金额文本
  const displayAmount = (() => {
    switch (transaction.type) {
      case 'income':
        return formatCurrency(Number(transaction.amount), { showSign: true })
      case 'expense':
        return formatCurrency(-Number(transaction.amount), { showSign: true })
      case 'refund':
        return formatCurrency(Number(transaction.amount), { showSign: true })
      case 'transfer': {
        const hasExtra = (transaction.fee || 0) > 0 || (transaction.coupon || 0) > 0
        return (
          <span>
            {formatCurrency(Number(transaction.amount))}
            {hasExtra && <span style={{ color: 'var(--mb-color-text-tertiary)', fontSize: 'var(--mb-font-size-caption)', marginLeft: 2 }}> +费</span>}
          </span>
        )
      }
      default:
        return formatCurrency(Number(transaction.amount))
    }
  })()

  return (
    <div
      className={`tx-item-row ${className ?? ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick() } : undefined}
    >
      {/* 左侧：类型色带 + 图标 */}
      <div className="tx-item-row__left">
        <div className="tx-item-row__bar" style={{ backgroundColor: typeConfig?.color }} />
        <div className="tx-item-row__icon">
          <CategoryIcon
            name={transaction.category?.icon}
            fallback="tag"
            color={transaction.category?.color}
            size={iconSize}
            iconSize={iconNameSize}
          />
        </div>
      </div>

      {/* 内容 */}
      <div className="tx-item-row__body">
        <div className="tx-item-row__category">{categoryName}</div>
        {note && <div className="tx-item-row__note">{note}</div>}
      </div>

      {/* 金额区 */}
      <div className="tx-item-row__right">
        <div className="tx-item-row__amount" style={{ color: amountColor }}>
          {displayAmount}
        </div>
        {showAccount && accountName && (
          <div className="tx-item-row__account">{accountName}</div>
        )}
      </div>
    </div>
  )
}

export default TransactionItemRow
