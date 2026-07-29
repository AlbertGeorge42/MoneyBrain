import React from 'react'
import { Button, Space, Tag, Divider, Typography, Modal, theme } from 'antd'
import { EditOutlined, RollbackOutlined, DeleteOutlined } from '@ant-design/icons'
import type { Transaction } from '../../services/api'
import { useAmountColors, TRANSACTION_TYPE_CONFIG } from '../../constants/transactionType'
import { formatCurrency } from '../../utils/format'
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

  const handleDeleteConfirm = async () => {
    await onDelete()
  }

  const showDeleteConfirm = () => {
    Modal.confirm({
      title: '确定要删除此交易记录吗？',
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
        return formatCurrency(Number(transaction.amount), { showSign: true })
      case 'expense':
        return formatCurrency(-Number(transaction.amount), { showSign: true })
      case 'refund':
        return formatCurrency(Number(transaction.amount), { showSign: true })
      case 'transfer':
        return formatCurrency(Number(transaction.amount))
      default:
        return formatCurrency(Number(transaction.amount))
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

  if (hasFee) {
    infoRows.push({ label: '手续费', content: <Text>{formatCurrency(Number(transaction.fee))}</Text> })
  }

  if (hasCoupon) {
    infoRows.push({ label: '优惠券', content: <Text>{formatCurrency(Number(transaction.coupon))}</Text> })
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
                    {formatCurrency(Number(transaction.relatedTransaction.amount))}
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
                      {formatCurrency(Number(refund.amount))}
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
    </div>
  )
}

export default TransactionDetail