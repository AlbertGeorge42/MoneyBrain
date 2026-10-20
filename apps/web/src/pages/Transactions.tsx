import React, { useMemo, useState } from 'react'
import { Button, Card, theme } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { Transaction, TransactionType } from '../services/api'
import type { Account, AccountCategory } from '../services/api'
import { toDateRangeParams, fromRangeTimeParam, toRangeTimeParam } from '../utils/timePicker'
import { PageHeader } from '../components/common'
import { useIsMobile } from '../hooks/useIsMobile'
import { useNotify } from '../hooks/useNotify'
import { useSearchParamsState } from '../hooks/useSearchParamsState'
import { usePersistedState } from '../hooks/usePersistedState'
import { STORAGE_KEYS } from '../utils/storageKeys'
import {
  useTransactions,
  useTransactionStats,
  useAccounts,
  useTransactionCategories,
  useAccountCategories,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
} from '../queries'
import {
  TransactionFilter,
  TransactionStats as TransactionStatsComponent,
  TransactionTable,
  FloatingActionButton,
  TransactionFilterValues,
  TransactionCreate,
} from '../components/transactions'
import TransactionDetail, { TransactionDetailFooter } from '../components/transactions/TransactionDetail'
import TransactionEdit from '../components/transactions/TransactionEdit'
import type { TransactionEditMode } from '../components/transactions/TransactionEdit'
import ResponsiveDrawer from '../components/common/ResponsiveDrawer'

const Transactions: React.FC = () => {
  // 新建状态
  const [createVisible, setCreateVisible] = useState(false)
  const [initialType, setInitialType] = useState<TransactionType>('expense')

  // 详情/编辑状态
  const [detailVisible, setDetailVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [editMode, setEditMode] = useState<TransactionEditMode>('edit')
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)

  // ── 持久化状态 ──

  // 筛选条件 → URL + sessionStorage（影响查询结果，可分享；页面切换时从 sessionStorage 恢复）
  const [filters, setFilters] = useSearchParamsState<TransactionFilterValues>({
    defaultValue: { type: [], accountId: [], categoryId: [], dateRange: null },
    storageKey: STORAGE_KEYS.transactions.filters,
    parse: (params) => ({
      type: (params.get('type') ?? '').split(',').filter(Boolean) as TransactionType[],
      accountId: (params.get('accountId') ?? '').split(',').filter(Boolean),
      categoryId: (params.get('categoryId') ?? '').split(',').filter(Boolean),
      dateRange: params.get('dateRange') ? fromRangeTimeParam(params.get('dateRange')!) : null,
    }),
    serialize: (value) => {
      const p = new URLSearchParams()
      if (value.type.length > 0) p.set('type', value.type.join(','))
      if (value.accountId.length > 0) p.set('accountId', value.accountId.join(','))
      if (value.categoryId.length > 0) p.set('categoryId', value.categoryId.join(','))
      if (value.dateRange) {
        p.set('dateRange', toRangeTimeParam(value.dateRange))
      }
      return p
    },
  })

  // 展开状态 → sessionStorage（纯 UI，仅本 Tab 恢复）
  const [filterExpanded, setFilterExpanded] = usePersistedState(
    STORAGE_KEYS.transactions.filterExpanded,
    false,
  )

  // 每页条数 → localStorage（长期偏好）
  const [pageSize, setPageSize] = usePersistedState(
    STORAGE_KEYS.transactions.pageSize,
    20,
    { storage: 'localStorage' },
  )

  // 页码 → 不持久化（跨周回来停在第37页体验差）
  const [currentPage, setCurrentPage] = useState(1)

  const { token } = theme.useToken()
  const isMobile = useIsMobile()
  const notify = useNotify()

  // 将 accountId 中的虚拟根节点展开为具体账户 ID
  const resolveAccountFilters = (ids: string[], accts: Account[], cats: AccountCategory[]): string[] => {
    const result: string[] = []
    for (const id of ids) {
      if (id === 'asset_root') {
        const catIds = cats.filter(c => c.type === 'asset').map(c => c.id)
        result.push(...accts.filter(a => a.categoryId && catIds.includes(a.categoryId)).map(a => a.id))
      } else if (id === 'liability_root') {
        const catIds = cats.filter(c => c.type === 'liability').map(c => c.id)
        result.push(...accts.filter(a => a.categoryId && catIds.includes(a.categoryId)).map(a => a.id))
      } else {
        result.push(id)
      }
    }
    return [...new Set(result)]
  }

  const { data: accounts = [] } = useAccounts()
  const { data: accountCategories = [] } = useAccountCategories()

  // 从 URL 筛选条件 + 本地分页状态派生查询参数
  const queryParams = useMemo<Record<string, unknown>>(() => {
    const params: Record<string, unknown> = { page: currentPage, pageSize }
    if (filters.type.length > 0) params.type = filters.type
    if (filters.accountId.length > 0) {
      params.accountId = resolveAccountFilters(filters.accountId, accounts, accountCategories)
    }
    if (filters.categoryId.length > 0) params.categoryId = filters.categoryId
    if (filters.dateRange) {
      Object.assign(params, toDateRangeParams(filters.dateRange))
    }
    return params
  }, [filters, currentPage, pageSize, accounts, accountCategories])

  const { data: transactionsData, isLoading: loading } = useTransactions(queryParams)
  const transactions = transactionsData?.list ?? []
  const pagination = {
    total: transactionsData?.total ?? 0,
    page: transactionsData?.page ?? 1,
    pageSize: transactionsData?.pageSize ?? 20,
  }

  const { data: stats = { income: 0, expense: 0, refund: 0, balance: 0, transferCount: 0 } } = useTransactionStats(queryParams)
  const { data: transactionCategories = [] } = useTransactionCategories()

  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const deleteTransaction = useDeleteTransaction()

  // 打开新建弹窗
  const handleAdd = (type: TransactionType = 'expense') => {
    setInitialType(type)
    setCreateVisible(true)
  }

  // 点击交易行 → 打开详情抽屉（在列表上方）
  const handleRowClick = (record: Transaction) => {
    setSelectedTransaction(record)
    setDetailVisible(true)
  }

  // 从详情切换到编辑（在详情上方）
  const handleEditFromDetail = () => {
    setEditVisible(true)
    setEditMode('edit')
  }

  // 从详情发起退款（在详情上方）
  const handleRefundFromDetail = () => {
    setEditVisible(true)
    setEditMode('refund')
  }

  // 从编辑返回详情（关闭编辑，详情仍在）
  const handleBackToDetail = () => {
    setEditVisible(false)
  }

  // 关闭详情抽屉（先播放关闭动画，动画结束后再卸载）
  const handleCloseDetail = () => {
    setDetailVisible(false)
    setEditVisible(false)
  }

  // 详情抽屉关闭动画结束后，清除选中数据
  const handleDetailAfterClose = () => {
    if (!detailVisible) {
      setSelectedTransaction(null)
    }
  }

  // 关闭编辑抽屉
  const handleCloseEdit = () => {
    setEditVisible(false)
  }

  // 新建提交
  const handleCreateSubmit = async (values: unknown) => {
    await createTransaction.mutateAsync(values as Record<string, unknown>)
    notify.success('创建成功')
    setCreateVisible(false)
  }

  // 编辑提交
  const handleEditSubmit = async (values: unknown) => {
    if (!selectedTransaction) return
    await updateTransaction.mutateAsync({ id: selectedTransaction.id, data: values as Partial<Transaction> })
    notify.success('更新成功')
    handleCloseDetail()
  }

  // 退款提交
  const handleRefundSubmit = async (values: unknown) => {
    if (!selectedTransaction) return
    const data = {
      type: 'refund' as const,
      amount: (values as { amount: number }).amount,
      fee: (values as { fee?: number }).fee || 0,
      coupon: (values as { coupon?: number }).coupon || 0,
      date: (values as { date: string }).date,
      accountId: (values as { accountId: string }).accountId,
      relatedTransactionId: selectedTransaction.id,
      note: (values as { note?: string }).note,
    }
    await createTransaction.mutateAsync(data)
    notify.success('退款记录成功')
    handleCloseDetail()
  }

  // 删除确认
  const handleDelete = async () => {
    if (!selectedTransaction) return
    await deleteTransaction.mutateAsync(selectedTransaction.id)
    notify.success('删除成功')
    handleCloseDetail()
  }

  // 筛选相关
  const handleSearch = () => {
    // 筛选条件已通过 URL search params 自动同步，只需重置页码
    setCurrentPage(1)
  }

  const handleReset = () => {
    setFilters({
      type: [],
      accountId: [],
      categoryId: [],
      dateRange: null,
    })
    setCurrentPage(1)
  }

  const handlePageChange = (newPage: number, newPageSize: number) => {
    setCurrentPage(newPage)
    setPageSize(newPageSize)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Transactions"
        title="交易记录"
        description="录入、筛选与修正。"
        actions={
          !isMobile ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd('expense')}>
              记一笔
            </Button>
          ) : undefined
        }
      />

      <Card style={{ marginBottom: `${token.padding}px` }}>
        <TransactionFilter
          accounts={accounts}
          categories={transactionCategories}
          accountCategories={accountCategories}
          filters={filters}
          filterExpanded={filterExpanded}
          onFilterChange={setFilters}
          onFilterExpandedChange={setFilterExpanded}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      </Card>

      <TransactionStatsComponent
        totalIncome={stats.income}
        totalExpense={stats.expense}
        totalRefund={stats.refund}
        balance={stats.balance}
        transferCount={stats.transferCount}
      />

      <TransactionTable
        transactions={transactions}
        loading={loading}
        currentPage={currentPage}
        pageSize={pageSize}
        total={pagination.total}
        onPageChange={handlePageChange}
        onRowClick={handleRowClick}
      />

      {isMobile && <FloatingActionButton onClick={() => handleAdd('expense')} />}

      {/* 新建抽屉 */}
      <TransactionCreate
        visible={createVisible}
        accounts={accounts}
        categories={transactionCategories}
        initialType={initialType}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateVisible(false)}
      />

      {/* 详情抽屉 */}
      {selectedTransaction && (
        <ResponsiveDrawer
          visible={detailVisible}
          title="交易详情"
          onCancel={handleCloseDetail}
          afterVisibleChange={handleDetailAfterClose}
          footer={
            <TransactionDetailFooter
              transactionType={selectedTransaction.type}
              onEdit={handleEditFromDetail}
              onRefund={handleRefundFromDetail}
              onDelete={handleDelete}
              isDeleting={deleteTransaction.isPending}
            />
          }
        >
          <TransactionDetail
            transaction={selectedTransaction}
          />
        </ResponsiveDrawer>
      )}

      {/* 编辑抽屉 */}
      <TransactionEdit
        visible={editVisible}
        transaction={selectedTransaction}
        accounts={accounts}
        categories={transactionCategories}
        onEdit={handleEditSubmit}
        onRefund={handleRefundSubmit}
        onCancel={handleCloseEdit}
        onBack={handleBackToDetail}
        mode={editMode}
      />
    </div>
  )
}

export default Transactions