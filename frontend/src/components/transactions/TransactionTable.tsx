import React from 'react'
import { Table, Card, Tag, Popconfirm } from 'antd'
import { EditOutlined, DeleteOutlined, RollbackOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { Transaction } from '../../services/api'
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
  fontWeightBold,
} from '../../styles/tokens'

interface TransactionTableProps {
  transactions: Transaction[]
  loading: boolean
  currentPage: number
  pageSize: number
  total: number
  onEdit: (record: Transaction) => void
  onDelete: (id: string) => void
  onPageChange: (page: number, pageSize: number) => void
  onRefund: (record: Transaction) => void
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
  return record.category?.name || '未分类'
}

const getSubtitle = (record: Transaction): string => {
  if (record.type === 'transfer') {
    const from = record.account?.name || ''
    const to = record.toAccount?.name || ''
    return `${from} → ${to}`
  }
  if (record.type === 'refund') {
    const original = record.relatedTransaction?.category?.name || ''
    const account = record.account?.name || ''
    return original ? `${original} · 退至${account}` : `退至${account}`
  }
  if (record.type === 'adjustment') {
    return record.account?.name || ''
  }
  const account = record.account?.name || ''
  const note = record.note || ''
  if (account && note) return `${account} · ${note}`
  return account || note
}

const CategoryCell: React.FC<{ record: Transaction }> = ({ record }) => {
  const config = TRANSACTION_TYPE_CONFIG[record.type as keyof typeof TRANSACTION_TYPE_CONFIG]
  const categoryName = getCategoryName(record)

  return (
    <Tag style={{ color: config?.color, borderColor: config?.color, backgroundColor: 'transparent' }}>
      {categoryName}
    </Tag>
  )
}

const AmountCell: React.FC<{ record: Transaction }> = ({ record }) => {
  const amount = record.amount
  const subtitle = getSubtitle(record)

  const renderAmount = () => {
    if (record.type === 'adjustment') {
      const isPositive = amount >= 0
      return (
        <span style={{ color: colorInvestment, fontWeight: fontWeightBold, fontSize: '13px' }}>
          {isPositive ? '+' : ''}¥{amount.toFixed(2)}
        </span>
      )
    }
    if (record.type === 'transfer') {
      const hasExtra = (record.fee || 0) > 0 || (record.coupon || 0) > 0
      return (
        <span>
          <span style={{ color: colorInfo, fontWeight: fontWeightBold, fontSize: '13px' }}>¥{amount.toFixed(2)}</span>
          {hasExtra && <span style={{ color: colorMuted, fontSize: '10px' }}> +费</span>}
        </span>
      )
    }
    if (record.type === 'refund') {
      return (
        <span style={{ color: colorWarning, fontWeight: fontWeightBold, fontSize: '13px' }}>
          +¥{amount.toFixed(2)}
        </span>
      )
    }
    return (
      <span style={{ color: record.type === 'income' ? colorPositive : colorNegative, fontWeight: fontWeightBold, fontSize: '13px' }}>
        {record.type === 'income' ? '+' : '-'}¥{amount.toFixed(2)}
      </span>
    )
  }

  return (
    <div className="tx-amount">
      <div className="tx-amount__value">{renderAmount()}</div>
      {subtitle && <div className="tx-amount__subtitle">{subtitle}</div>}
    </div>
  )
}

const ActionCell: React.FC<{
  record: Transaction
  onEdit: (r: Transaction) => void
  onDelete: (id: string) => void
  onRefund: (r: Transaction) => void
}> = ({ record, onEdit, onDelete, onRefund }) => {
  const canRefund = record.type === 'income' || record.type === 'expense'

  return (
    <div className="tx-actions">
      {canRefund && (
        <button
          className="tx-actions__btn tx-actions__btn--refund"
          onClick={(e) => { e.stopPropagation(); onRefund(record) }}
          title="退款"
        >
          <RollbackOutlined />
        </button>
      )}
      <button
        className="tx-actions__btn"
        onClick={(e) => { e.stopPropagation(); onEdit(record) }}
        title="编辑"
      >
        <EditOutlined />
      </button>
      <Popconfirm
        title="确定要删除此记录吗？"
        onConfirm={(e) => { e?.stopPropagation(); onDelete(record.id) }}
        onCancel={(e) => e?.stopPropagation()}
        okText="确定"
        cancelText="取消"
      >
        <button
          className="tx-actions__btn tx-actions__btn--danger"
          onClick={(e) => e.stopPropagation()}
          title="删除"
        >
          <DeleteOutlined />
        </button>
      </Popconfirm>
    </div>
  )
}

const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  loading,
  currentPage,
  pageSize,
  total,
  onEdit,
  onDelete,
  onPageChange,
  onRefund,
}) => {
  const columns = [
    {
      title: '分类',
      key: 'category',
      render: (_: unknown, record: Transaction) => <CategoryCell record={record} />,
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 56,
      align: 'right' as const,
      render: (date: string) => (
        <span style={{ color: colorMuted, fontSize: '12px' }}>{dayjs(date).format('MM-DD')}</span>
      ),
    },
    {
      title: '金额',
      key: 'amount',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, record: Transaction) => <AmountCell record={record} />,
    },
    {
      title: '',
      key: 'actions',
      width: 72,
      align: 'right' as const,
      render: (_: unknown, record: Transaction) => (
        <ActionCell record={record} onEdit={onEdit} onDelete={onDelete} onRefund={onRefund} />
      ),
    },
  ]

  return (
    <Card className="tx-table" style={{ margin: '0 -1px', overflow: 'hidden' }}>
      <Table
        dataSource={transactions}
        columns={columns}
        rowKey="id"
        scroll={{ x: 320 }}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total,
          size: 'small',
          showSizeChanger: false,
          showTotal: (t) => `共 ${t} 条`,
          onChange: onPageChange,
        }}
        loading={loading}
        onRow={(record) => ({
          onClick: () => onEdit(record),
          className: 'tx-row',
        })}
        style={{ overflowX: 'auto' }}
      />
    </Card>
  )
}

export default TransactionTable
