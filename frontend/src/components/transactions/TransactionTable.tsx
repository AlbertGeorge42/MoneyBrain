import React from 'react'
import { Table, Card, Tag, Space, Button, Popconfirm } from 'antd'
import { EditOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { Transaction } from '../../services/api'
import { TRANSACTION_TYPE_CONFIG } from '../../constants/transaction'
import {
  colorInfo,
  colorWarning,
  colorInvestment,
  colorPositive,
  colorNegative,
  colorMuted,
  fontWeightBold,
  fontSizeXs,
  spaceSm,
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
}

const columns = (onEdit: (r: Transaction) => void, onDelete: (id: string) => void) => [
  {
    title: '日期',
    dataIndex: 'date',
    key: 'date',
    width: 120,
    render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
  },
  {
    title: '类型',
    dataIndex: 'type',
    key: 'type',
    width: 80,
    render: (type: string) => {
      const config = TRANSACTION_TYPE_CONFIG[type] || { color: 'default', text: type }
      return <Tag color={config.color}>{config.text}</Tag>
    },
  },
  {
    title: '分类',
    key: 'category',
    render: (_: unknown, record: Transaction) => {
      if (record.type === 'adjustment') {
        return <Tag color="purple">{record.note || '平账调整'}</Tag>
      }
      if (record.type === 'transfer') {
        return record.category ? (
          <Tag>{record.category.name}</Tag>
        ) : (
          <Tag>内部转账</Tag>
        )
      }
      if (record.type === 'refund') {
        return (
          <span>
            <Tag>{record.category?.name || '退款'}</Tag>
            {record.relatedTransaction && (
              <span style={{ color: colorMuted, fontSize: fontSizeXs }}> (原: {record.relatedTransaction.category?.name})</span>
            )}
          </span>
        )
      }
      return <Tag>{record.category?.name || '未分类'}</Tag>
    },
  },
  {
    title: '账户',
    key: 'account',
    render: (_: unknown, record: Transaction) => {
      if (record.type === 'transfer') {
        return (
          <span>
            <Tag>{record.account?.name}</Tag>
            <span style={{ margin: `0 ${spaceSm}` }}>→</span>
            <Tag>{record.toAccount?.name}</Tag>
          </span>
        )
      }
      return <Tag>{record.account?.name || '-'}</Tag>
    },
  },
  {
    title: '金额',
    dataIndex: 'amount',
    key: 'amount',
    render: (amount: number, record: Transaction) => {
      const fee = record.fee || 0
      const coupon = record.coupon || 0
      const hasExtra = fee > 0 || coupon > 0
      
      if (record.type === 'adjustment') {
        const isPositive = amount >= 0
        return (
          <span style={{ color: colorInvestment, fontWeight: fontWeightBold }}>
            {isPositive ? '+' : ''}¥{amount.toFixed(2)}
          </span>
        )
      }
      if (record.type === 'transfer') {
        return (
          <span>
            <span style={{ color: colorInfo, fontWeight: fontWeightBold }}>¥{amount.toFixed(2)}</span>
            {hasExtra && <span style={{ color: colorMuted, fontSize: fontSizeXs }}> (手续费:¥{fee}, 优惠:¥{coupon})</span>}
          </span>
        )
      }
      if (record.type === 'refund') {
        return (
          <span>
            <span style={{ color: colorWarning, fontWeight: fontWeightBold }}>+¥{amount.toFixed(2)}</span>
            {hasExtra && <span style={{ color: colorMuted, fontSize: fontSizeXs }}> (手续费:¥{fee})</span>}
          </span>
        )
      }
      return (
        <span>
          <span style={{ color: record.type === 'income' ? colorPositive : colorNegative, fontWeight: fontWeightBold }}>
            {record.type === 'income' ? '+' : '-'}¥{amount.toFixed(2)}
          </span>
          {hasExtra && <span style={{ color: colorMuted, fontSize: fontSizeXs }}> (手续费:¥{fee}, 优惠:¥{coupon})</span>}
        </span>
      )
    },
  },
  {
    title: '备注',
    dataIndex: 'note',
    key: 'note',
    ellipsis: true,
  },
  {
    title: '操作',
    key: 'action',
    width: 120,
    render: (_: unknown, record: Transaction) => (
      <Space>
        <Button 
          type="link" 
          icon={<EditOutlined />} 
          onClick={() => onEdit(record)}
        />
        <Popconfirm
          title="确定要删除此记录吗？"
          onConfirm={() => onDelete(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    ),
  },
]

const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  loading,
  currentPage,
  pageSize,
  total,
  onEdit,
  onDelete,
  onPageChange,
}) => (
  <Card>
    <Table 
      dataSource={transactions} 
      columns={columns(onEdit, onDelete)} 
      rowKey="id"
      pagination={{
        current: currentPage,
        pageSize: pageSize,
        total,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (t) => `共 ${t} 条`,
        onChange: onPageChange,
      }}
      loading={loading}
    />
  </Card>
)

export default TransactionTable
