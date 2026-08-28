import React, { useMemo, useState } from 'react'
import { Empty, Skeleton } from 'antd'
import { ResponsiveDrawer } from '../common'
import { useTransactions, useUpdateTransaction, useDeleteTransaction, useCreateTransaction, useAccounts, useTransactionCategories } from '../../queries'
import TransactionItemRow from './TransactionItemRow'
import TransactionDetail, { TransactionDetailFooter } from './TransactionDetail'
import TransactionEdit, { type TransactionEditMode } from './TransactionEdit'
import { groupTransactionsByDate } from '../../utils/transaction'
import { toDateRangeParams } from '../../utils/timePicker'
import type { RangeTimeValue } from '../../utils/timePicker'
import { formatCurrency } from '../../utils/format'
import { useAmountColors } from '../../hooks/useAmountColors'
import { useNotify } from '../../hooks/useNotify'
import type { Transaction } from '../../services/api'

interface TransactionDrawerProps {
  /** 是否可见 */
  visible: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 标题 */
  title: string
  /** 筛选条件 */
  filters: {
    accountId?: string[]
    categoryId?: string[]
    dateRange: RangeTimeValue
  }
}

/**
 * 交易记录抽屉（带详情/编辑功能）
 *
 * 内部管理三个独立抽屉：
 * - 列表抽屉（由父组件控制 visible）
 * - 详情抽屉（detailVisible）
 * - 编辑抽屉（editVisible）
 *
 * 视图切换逻辑与 Transactions.tsx 保持一致。
 */
const TransactionDrawer: React.FC<TransactionDrawerProps> = ({
  visible,
  onClose,
  title,
  filters,
}) => {
  const amountColors = useAmountColors()
  const notify = useNotify()

  // ── 视图状态（与 Transactions.tsx 一致的模式） ──
  const [detailVisible, setDetailVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [editMode, setEditMode] = useState<TransactionEditMode>('edit')

  // ── 数据查询 ──
  const queryParams = useMemo<Record<string, unknown>>(() => {
    const params: Record<string, unknown> = {}
    if (filters.accountId && filters.accountId.length > 0) {
      params.accountId = filters.accountId
    }
    if (filters.categoryId && filters.categoryId.length > 0) {
      params.categoryId = filters.categoryId
    }
    if (filters.dateRange) {
      Object.assign(params, toDateRangeParams(filters.dateRange))
    }
    return params
  }, [filters.accountId, filters.categoryId, filters.dateRange])

  const { data: transactionsData, isLoading } = useTransactions({
    ...queryParams,
    page: 1,
    pageSize: 100,
  })

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useTransactionCategories()
  const updateTransaction = useUpdateTransaction()
  const deleteTransaction = useDeleteTransaction()
  const createTransaction = useCreateTransaction()

  const transactions = useMemo(() => transactionsData?.list ?? [], [transactionsData?.list])
  const groups = useMemo(() => groupTransactionsByDate(transactions), [transactions])

  // ── 汇总统计 ──
  const stats = useMemo(() => {
    let income = 0
    let expense = 0
    for (const tx of transactions) {
      if (tx.type === 'income') income += tx.amount
      if (tx.type === 'expense') expense += tx.amount
    }
    return { income, expense, count: transactions.length }
  }, [transactions])

  // ── 视图切换（与 Transactions.tsx 一致：弹出新抽屉，× 关闭当前层） ──
  const handleRowClick = (tx: Transaction) => {
    setSelectedTx(tx)
    setDetailVisible(true)
  }

  const handleEditFromDetail = () => {
    setEditVisible(true)
    setEditMode('edit')
  }

  const handleRefundFromDetail = () => {
    setEditVisible(true)
    setEditMode('refund')
  }

  const handleBackToDetail = () => {
    setEditVisible(false)
  }

  // 关闭详情抽屉（先播放关闭动画，动画结束后再卸载）
  const handleCloseDetail = () => {
    setDetailVisible(false)
    setEditVisible(false)
  }

  // 详情抽屉关闭动画结束后，清除选中数据
  const handleDetailAfterClose = (open: boolean) => {
    if (!open) {
      setSelectedTx(null)
    }
  }

  // 关闭编辑抽屉
  const handleCloseEdit = () => {
    setEditVisible(false)
  }

  // ── CRUD 操作 ──
  const handleEditSubmit = async (values: unknown) => {
    if (!selectedTx) return
    await updateTransaction.mutateAsync({ id: selectedTx.id, data: values as Partial<Transaction> })
    notify.success('更新成功')
    handleCloseDetail()
  }

  const handleRefundSubmit = async (values: unknown) => {
    if (!selectedTx) return
    const data = {
      type: 'refund' as const,
      amount: (values as { amount: number }).amount,
      fee: (values as { fee?: number }).fee || 0,
      coupon: (values as { coupon?: number }).coupon || 0,
      date: (values as { date: string }).date,
      accountId: (values as { accountId: string }).accountId,
      relatedTransactionId: selectedTx.id,
      note: (values as { note?: string }).note,
    }
    await createTransaction.mutateAsync(data)
    notify.success('退款记录成功')
    handleCloseDetail()
  }

  const handleDelete = async () => {
    if (!selectedTx) return
    await deleteTransaction.mutateAsync(selectedTx.id)
    notify.success('删除成功')
    handleCloseDetail()
  }

  return (
    <>
      {/* ===== 列表抽屉 ===== */}
      <ResponsiveDrawer
        visible={visible}
        title={title}
        onCancel={onClose}
        width={480}
        footer={
          transactions.length > 0 ? (
            <div style={{ display: 'flex', gap: 16, fontSize: 'var(--mb-font-size-body)' }}>
              <span>共 {stats.count} 笔</span>
              {stats.income > 0 && (
                <span style={{ color: amountColors.positive }}>收入 {formatCurrency(stats.income)}</span>
              )}
              {stats.expense > 0 && (
                <span style={{ color: amountColors.negative }}>支出 {formatCurrency(stats.expense)}</span>
              )}
            </div>
          ) : undefined
        }
      >
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : transactions.length === 0 ? (
          <Empty description="该时间范围内暂无交易记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="tx-group-list">
            {groups.map((group) => (
              <div key={group.date} className="tx-group">
                <div className="tx-group-header">
                  <div className="tx-group-header__date">
                    <span className="tx-group-header__day">{group.dayLabel}</span>
                    <span className="tx-group-header__weekday">{group.weekDay}</span>
                  </div>
                  <div className="tx-group-header__summary">
                    {group.income > 0 && (
                      <span className="tx-group-header__summary-item" style={{ color: amountColors.positive }}>
                        收 {formatCurrency(group.income)}
                      </span>
                    )}
                    {group.expense > 0 && (
                      <span className="tx-group-header__summary-item" style={{ color: amountColors.negative }}>
                        支 {formatCurrency(group.expense)}
                      </span>
                    )}
                  </div>
                </div>
                {group.transactions.map((tx) => (
                  <TransactionItemRow
                    key={tx.id}
                    transaction={tx}
                    showAccount
                    showNote
                    onClick={() => handleRowClick(tx)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </ResponsiveDrawer>

      {/* ===== 详情抽屉 ===== */}
      {selectedTx && (
        <ResponsiveDrawer
          visible={detailVisible}
          title="交易详情"
          onCancel={handleCloseDetail}
          afterVisibleChange={handleDetailAfterClose}
          footer={
            <TransactionDetailFooter
              transactionType={selectedTx.type}
              onEdit={handleEditFromDetail}
              onRefund={handleRefundFromDetail}
              onDelete={handleDelete}
              isDeleting={deleteTransaction.isPending}
            />
          }
        >
          <TransactionDetail transaction={selectedTx} />
        </ResponsiveDrawer>
      )}

      {/* ===== 编辑抽屉 ===== */}
      <TransactionEdit
        visible={editVisible}
        transaction={selectedTx}
        accounts={accounts}
        categories={categories}
        onEdit={handleEditSubmit}
        onRefund={handleRefundSubmit}
        onCancel={handleCloseEdit}
        onBack={handleBackToDetail}
        mode={editMode}
      />
    </>
  )
}

export default TransactionDrawer
