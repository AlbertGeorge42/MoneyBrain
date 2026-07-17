import React, { useMemo } from 'react'
import { Card, Empty, theme } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Transaction } from '../../services/api'
import { groupTransactionsByDate, TransactionGroup } from '../../utils/transaction'
import { useIsMobile } from '../../hooks/useIsMobile'
import { AMOUNT_COLORS } from '../../constants/transactionType'
import { formatCurrency } from '../../utils/format'
import TransactionItemRow from './TransactionItemRow'

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

const GroupHeader: React.FC<{ group: TransactionGroup }> = ({ group }) => {
  return (
    <div className="tx-group-header">
      <div className="tx-group-header__date">
        <span className="tx-group-header__day">{group.dayLabel}</span>
        <span className="tx-group-header__weekday">{group.weekDay}</span>
      </div>
      <div className="tx-group-header__summary">
        {group.income > 0 && (
          <span className="tx-group-header__summary-item" style={{ color: AMOUNT_COLORS.positive }}>收 {formatCurrency(group.income)}</span>
        )}
        {group.expense > 0 && (
          <span className="tx-group-header__summary-item" style={{ color: AMOUNT_COLORS.negative }}>支 {formatCurrency(group.expense)}</span>
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
  const spaceCardPadding = `${token.padding}px`

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
                  <TransactionItemRow
                    key={record.id}
                    transaction={record}
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
