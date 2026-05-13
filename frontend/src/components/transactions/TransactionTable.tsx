import React, { useState, useEffect, useMemo } from 'react'
import { Card, Tag, Empty } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Transaction } from '../../services/api'
import { groupTransactionsByDate, TransactionGroup } from '../../utils/transaction'
import {
  colorInfo,
  colorWarning,
  colorInvestment,
  colorPositive,
  colorNegative,
  colorMuted,
  colorIncome,
  colorExpense,
  colorTransfer,
  colorRefund,
  colorAdjustment,
  spaceMd,
} from '../../styles/tokens'

interface TransactionTableProps {
  transactions: Transaction[]
  loading: boolean
  currentPage: number
  pageSize: number
  total: number
  onPageChange: (page: number, pageSize: number) => void
  onRowClick: (record: Transaction) => void
}

const MOBILE_BREAKPOINT = 860

const MobilePagination: React.FC<{
  current: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}> = ({ current, pageSize, total, onChange }) => {
  const totalPages = Math.ceil(total / pageSize)
  const hasPrev = current > 1
  const hasNext = current < totalPages

  return (
    <div className="mobile-pagination">
      <div className="mobile-pagination__info">
        共 {total} 条 · 第 {current}/{totalPages} 页
      </div>
      <div className="mobile-pagination__controls">
        <button
          className="mobile-pagination__btn"
          disabled={!hasPrev}
          onClick={() => hasPrev && onChange(current - 1)}
        >
          <LeftOutlined />
        </button>
        <button
          className="mobile-pagination__btn"
          disabled={!hasNext}
          onClick={() => hasNext && onChange(current + 1)}
        >
          <RightOutlined />
        </button>
      </div>
    </div>
  )
}

const TRANSACTION_TYPE_CONFIG = {
  income: { color: colorIncome, text: '收入' },
  expense: { color: colorExpense, text: '支出' },
  transfer: { color: colorTransfer, text: '转账' },
  refund: { color: colorRefund, text: '退款' },
  adjustment: { color: colorAdjustment, text: '平账' },
} as const

const getCategoryName = (record: Transaction): string => {
  if (record.type === 'adjustment') return record.note || '平账调整'
  if (record.type === 'transfer') return record.category?.name || '内部转账'
  if (record.type === 'refund') {
    const original = record.relatedTransaction?.category?.name || ''
    return original || '退款'
  }
  return record.category?.name || '未分类'
}

const getAccountName = (record: Transaction): string => {
  if (record.type === 'transfer') {
    const from = record.account?.name || ''
    const to = record.toAccount?.name || ''
    return `${from} → ${to}`
  }
  if (record.type === 'refund') {
    return record.account?.name || ''
  }
  return record.account?.name || ''
}

const getNote = (record: Transaction): string | null => {
  if (record.type === 'transfer') {
    return record.note || null
  }
  if (record.type === 'refund') {
    return record.note || null
  }
  if (record.type === 'adjustment') {
    return record.note || null
  }
  return record.note || null
}

const CategoryTag: React.FC<{ record: Transaction }> = ({ record }) => {
  const config = TRANSACTION_TYPE_CONFIG[record.type as keyof typeof TRANSACTION_TYPE_CONFIG]
  const categoryName = getCategoryName(record)

  return (
    <Tag style={{ color: config?.color, borderColor: config?.color, backgroundColor: 'transparent' }}>
      {categoryName}
    </Tag>
  )
}

const AmountDisplay: React.FC<{ record: Transaction }> = ({ record }) => {
  const amount = record.amount

  const renderAmount = () => {
    if (record.type === 'adjustment') {
      const isPositive = amount >= 0
      return (
        <span style={{ color: colorInvestment, fontSize: '14px' }}>
          {isPositive ? '+' : ''}¥{amount.toFixed(2)}
        </span>
      )
    }
    if (record.type === 'transfer') {
      const hasExtra = (record.fee || 0) > 0 || (record.coupon || 0) > 0
      return (
        <span>
          <span style={{ color: colorInfo, fontSize: '14px' }}>¥{amount.toFixed(2)}</span>
          {hasExtra && <span style={{ color: colorMuted, fontSize: '10px' }}> +费</span>}
        </span>
      )
    }
    if (record.type === 'refund') {
      return (
        <span style={{ color: colorWarning, fontSize: '14px' }}>
          +¥{amount.toFixed(2)}
        </span>
      )
    }
    return (
      <span style={{ color: record.type === 'income' ? colorPositive : colorNegative, fontSize: '14px' }}>
        {record.type === 'income' ? '+' : '-'}¥{amount.toFixed(2)}
      </span>
    )
  }

  return <div className="tx-group-item__amount">{renderAmount()}</div>
}

const TransactionRow: React.FC<{
  record: Transaction
  onClick: () => void
}> = ({ record, onClick }) => {
  const accountName = getAccountName(record)
  const note = getNote(record)

  return (
    <div className="tx-group-item" onClick={onClick}>
      <div className="tx-group-item__left">
        <CategoryTag record={record} />
        {note && <span className="tx-group-item__subtitle">{note}</span>}
      </div>
      <div className="tx-group-item__right">
        <AmountDisplay record={record} />
        <span className="tx-group-item__account">{accountName}</span>
      </div>
    </div>
  )
}

const GroupHeader: React.FC<{ group: TransactionGroup }> = ({ group }) => {
  return (
    <div className="tx-group-header">
      <div className="tx-group-header__date">
        <span className="tx-group-header__day">{group.dayLabel}</span>
        <span className="tx-group-header__weekday">{group.weekDay}</span>
      </div>
      <div className="tx-group-header__summary">
        {group.income > 0 && (
          <span className="tx-group-header__summary-item" style={{ color: colorPositive }}>收 ¥{group.income.toFixed(2)}</span>
        )}
        {group.expense > 0 && (
          <span className="tx-group-header__summary-item" style={{ color: colorNegative }}>支 ¥{group.expense.toFixed(2)}</span>
        )}
      </div>
    </div>
  )
}

const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  loading,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onRowClick,
}) => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const grouped = useMemo(() => {
    return groupTransactionsByDate(transactions)
  }, [transactions])

  const renderDesktopPagination = () => {
    if (isMobile) return null
    const totalPages = Math.ceil(total / pageSize)
    if (totalPages <= 1) return null

    return (
      <div className="tx-group-pagination">
        <button
          className="tx-group-pagination__btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1, pageSize)}
        >
          上一页
        </button>
        <span className="tx-group-pagination__info">
          第 {currentPage} / {totalPages} 页
        </span>
        <button
          className="tx-group-pagination__btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1, pageSize)}
        >
          下一页
        </button>
      </div>
    )
  }

  return (
    <Card className="tx-table" style={{ margin: '0 -1px', overflow: 'hidden', marginBottom: spaceMd }}>
      {transactions.length === 0 && !loading ? (
        <Empty description="暂无交易记录" style={{ padding: '40px 0' }} />
      ) : (
        <div className="tx-group-list">
          {grouped.map((group) => (
            <div key={group.date} className="tx-group">
              <GroupHeader group={group} />
              <div className="tx-group-body">
                {group.transactions.map((record) => (
                  <TransactionRow
                    key={record.id}
                    record={record}
                    onClick={() => onRowClick(record)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {renderDesktopPagination()}

      {isMobile && (
        <MobilePagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          onChange={(page) => onPageChange(page, pageSize)}
        />
      )}
    </Card>
  )
}

export default TransactionTable
