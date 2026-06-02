import React, { useMemo } from 'react'
import { Card, Empty, theme } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Transaction } from '../../services/api'
import { groupTransactionsByDate, TransactionGroup } from '../../utils/transaction'
import { useIsMobile } from '../../hooks/useIsMobile'
import { TRANSACTION_TYPE_CONFIG, TRANSACTION_COLORS, TransactionType } from '../../constants/transactionType'
import BorderedTag from '../common/BorderedTag'

interface TransactionTableProps {
  transactions: Transaction[]
  loading: boolean
  currentPage: number
  pageSize: number
  total: number
  onPageChange: (page: number, pageSize: number) => void
  onRowClick: (record: Transaction) => void
}

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
  return record.account?.name || ''
}

const CategoryTag: React.FC<{ record: Transaction }> = ({ record }) => {
  const config = TRANSACTION_TYPE_CONFIG[record.type as TransactionType]
  const categoryName = getCategoryName(record)

  return (
    <BorderedTag color={config.color}>
      {categoryName}
    </BorderedTag>
  )
}

const AmountDisplay: React.FC<{
  record: Transaction
  colorTextMuted: string
  fontSizeBody: string
  fontSizeCaption: string
}> = ({ record, colorTextMuted, fontSizeBody, fontSizeCaption }) => {
  const amount = record.amount

  const renderAmount = () => {
    if (record.type === 'adjustment') {
      const isPositive = amount >= 0
      return (
        <span style={{ color: TRANSACTION_COLORS.adjustment, fontSize: fontSizeBody }}>
          {isPositive ? '+' : ''}¥{amount.toFixed(2)}
        </span>
      )
    }
    if (record.type === 'transfer') {
      const hasExtra = (record.fee || 0) > 0 || (record.coupon || 0) > 0
      return (
        <span>
          <span style={{ color: TRANSACTION_COLORS.transfer, fontSize: fontSizeBody }}>¥{amount.toFixed(2)}</span>
          {hasExtra && <span style={{ color: colorTextMuted, fontSize: fontSizeCaption }}> +费</span>}
        </span>
      )
    }
    if (record.type === 'refund') {
      return (
        <span style={{ color: TRANSACTION_COLORS.refund, fontSize: fontSizeBody }}>
          +¥{amount.toFixed(2)}
        </span>
      )
    }
    return (
      <span style={{ color: record.type === 'income' ? TRANSACTION_COLORS.positive : TRANSACTION_COLORS.negative, fontSize: fontSizeBody }}>
        {record.type === 'income' ? '+' : '-'}¥{amount.toFixed(2)}
      </span>
    )
  }

  return <div className="tx-group-item__amount">{renderAmount()}</div>
}

const TransactionRow: React.FC<{
  record: Transaction
  onClick: () => void
  colorTextMuted: string
  fontSizeBody: string
  fontSizeCaption: string
}> = ({ record, onClick, colorTextMuted, fontSizeBody, fontSizeCaption }) => {
  const accountName = getAccountName(record)
  const note = record.note || null

  return (
    <div className="tx-group-item" onClick={onClick}>
      <div className="tx-group-item__left">
        <CategoryTag record={record} />
        {note && <span className="tx-group-item__subtitle">{note}</span>}
      </div>
      <div className="tx-group-item__right">
        <AmountDisplay record={record} colorTextMuted={colorTextMuted} fontSizeBody={fontSizeBody} fontSizeCaption={fontSizeCaption} />
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
          <span className="tx-group-header__summary-item" style={{ color: TRANSACTION_COLORS.positive }}>收 ¥{group.income.toFixed(2)}</span>
        )}
        {group.expense > 0 && (
          <span className="tx-group-header__summary-item" style={{ color: TRANSACTION_COLORS.negative }}>支 ¥{group.expense.toFixed(2)}</span>
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
  const { token } = theme.useToken()
  const colorTextMuted = token.colorTextTertiary
  const spaceCardPadding = `${token.padding}px`
  const fontSizeBody = `${token.fontSize}px`
  const fontSizeCaption = `${token.fontSizeSM}px`

  const isMobile = useIsMobile()

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
    <Card className="tx-table" style={{ margin: '0 -1px', overflow: 'hidden', marginBottom: spaceCardPadding }}>
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
                    colorTextMuted={colorTextMuted}
                    fontSizeBody={fontSizeBody}
                    fontSizeCaption={fontSizeCaption}
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
