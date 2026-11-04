// HF 页面的样式只在 /design 里被引入；生产路由复用同一套页面时必须一起加载。
import '../design/hf.css'
import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useHotkeys } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useCreateTransaction, useDeleteTransaction, useUndoAuditEvent, useUpdateTransaction, useTransactions } from '../../queries/transaction'
import { useAccounts } from '../../queries/account'
import { useTransactionCategories } from '../../queries/category'
import { useAssetTrend, useDashboardSummary } from '../../queries/analytics'
import { useBalanceSheet } from '../../queries/report'
import { getApiErrorMessage } from '../../services/apiError'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useTheme } from '../../styles/ThemeContext'
import { ThemeRoot } from '../../styles/theme/ThemeRoot'
import type { ColorScheme } from '../../styles/theme/tokens'
import { EntryOverlay } from '../../features/transactions/EntryOverlay'
import { OverviewScreen } from '../../features/overview/OverviewScreen'
import { buildOverviewView } from '../../features/overview/overview-data'
import { TransactionsScreen } from '../../features/transactions/TransactionsScreen'
import { showUndoToast } from '../../features/transactions/undo-toast'
import {
  toApiTransactionPayload,
  toApiUpdatePayload,
  toHfAccounts,
  toHfCategories,
  toHfTransactions,
} from '../../features/transactions/transactions-data'
import type { DataState, DeviceMode, LedgerActions, Transaction } from '../../features/transactions/types'
import type { NavPage } from '../design/navigation'
import { ShellFrame } from '../design/ShellFrame'
import { ProdReports } from './ProdReports'

const PAGE_SIZE = 200

const ROUTES: Record<NavPage, string> = {
  overview: '/dashboard',
  transactions: '/transactions',
  reports: '/reports',
  budgets: '/legacy/budgets',
  settings: '/legacy/settings',
}

type ProdShellProps = {
  page: 'overview' | 'transactions' | 'reports'
}

/** 生产壳：复用 HF 外壳与页面，数据全部来自现有 API 查询/变更。 */
export function ProdShell({ page }: ProdShellProps) {
  const { theme } = useTheme()
  const scheme: ColorScheme = theme
  const device: DeviceMode = useIsMobile() ? 'mobile' : 'pc'
  const navigate = useNavigate()
  const [entryOpen, setEntryOpen] = useState(false)
  const [batchMode, setBatchMode] = useState(false)

  const today = dayjs().format('YYYY-MM-DD')
  const periodLabel = `${dayjs().year()} 年 ${dayjs().month() + 1} 月`

  const transactions = useTransactions({ page: 1, pageSize: PAGE_SIZE })
  const accounts = useAccounts()
  const categories = useTransactionCategories()
  const dashboard = useDashboardSummary()
  const sheet = useBalanceSheet(today)
  const assetTrend = useAssetTrend()

  const items = useMemo(() => toHfTransactions(transactions.data?.list), [transactions.data])
  const hfAccounts = useMemo(() => toHfAccounts(accounts.data), [accounts.data])
  const hfCategories = useMemo(() => toHfCategories(categories.data), [categories.data])
  const accountCount = accounts.data?.length ?? 0

  const overviewView = useMemo(
    () => buildOverviewView({
      today,
      items,
      dashboard: dashboard.data,
      sheet: sheet.data,
      assetTrend: assetTrend.data,
      accountCount,
    }),
    [today, items, dashboard.data, sheet.data, assetTrend.data, accountCount],
  )

  const createMutation = useCreateTransaction()
  const updateMutation = useUpdateTransaction()
  const deleteMutation = useDeleteTransaction({ silent: true })
  const undoMutation = useUndoAuditEvent({ silent: true })

  const actions: LedgerActions = {
    update: (next: Transaction) => {
      updateMutation.mutate(
        { id: next.id, data: toApiUpdatePayload(next) },
        {
          onSuccess: () => notifications.show({ message: '已保存修改', autoClose: 2600 }),
          onError: (error) => notifications.show({
            color: 'red',
            message: getApiErrorMessage(error, '保存失败'),
            autoClose: 4000,
          }),
        },
      )
    },
    remove: (ids: string[]) => {
      void (async () => {
        const auditIds: string[] = []
        for (const id of ids) {
          try {
            const result = await deleteMutation.mutateAsync(id)
            auditIds.push(result.auditEventId)
          } catch (error) {
            notifications.show({
              color: 'red',
              message: getApiErrorMessage(error, '删除失败'),
              autoClose: 4000,
            })
            return
          }
        }
        showUndoToast(
          `prod-delete-${ids[0]}-${ids.length}`,
          ids.length > 1 ? `已删除 ${ids.length} 笔` : '已删除这笔',
          () => {
            for (const auditId of auditIds) undoMutation.mutate(auditId)
          },
        )
      })()
    },
  }

  const onEntrySaved = async (tx: Transaction) => {
    try {
      await createMutation.mutateAsync(toApiTransactionPayload(tx))
    } catch (error) {
      throw new Error(getApiErrorMessage(error, '保存失败，请重试'))
    }
  }

  const loading = transactions.isLoading || accounts.isLoading || categories.isLoading
    || dashboard.isLoading || sheet.isLoading
  const error = transactions.isError || accounts.isError || categories.isError
    || dashboard.isError || sheet.isError
  const dataState: DataState = loading
    ? 'loading'
    : error
      ? 'error'
      : items.length === 0
        ? 'empty'
        : 'ready'

  const retry = () => {
    void transactions.refetch()
    void accounts.refetch()
    void categories.refetch()
    void dashboard.refetch()
    void sheet.refetch()
    void assetTrend.refetch()
  }

  const ledgerExpense = overviewView.summary.expense
  const ledgerNote = dataState === 'empty'
    ? '还没有记录'
    : `共 ${transactions.data?.total ?? items.length} 笔 · ${accountCount} 个账户`

  /** 与 /design 预览同一条热键链路：N 记一笔、1–5 切页、/ 搜流水（输入框内不触发）。 */
  useHotkeys([
    ['n', () => { if (!entryOpen) setEntryOpen(true) }],
    ['1', () => { if (!entryOpen) navigate(ROUTES.overview) }],
    ['2', () => { if (!entryOpen) navigate(ROUTES.transactions) }],
    ['3', () => { if (!entryOpen) navigate(ROUTES.reports) }],
    ['4', () => { if (!entryOpen) navigate(ROUTES.budgets) }],
    ['5', () => { if (!entryOpen) navigate(ROUTES.settings) }],
    ['/', () => {
      if (entryOpen) return
      const focusSearch = () => document.querySelector<HTMLInputElement>('.tx-search input')?.focus()
      if (page === 'transactions') {
        focusSearch()
        return
      }
      navigate(ROUTES.transactions)
      window.setTimeout(focusSearch, 120)
    }],
    ['Escape', () => { if (!entryOpen) setBatchMode(false) }],
  ])

  const allowedTypes = hfAccounts.length >= 2
    ? (['expense', 'income', 'transfer'] as const)
    : (['expense', 'income'] as const)

  const content = page === 'reports' ? (
    <ProdReports
      device={device}
      items={items}
      onRecord={() => setEntryOpen(true)}
      onOpenTransactions={() => navigate(ROUTES.transactions)}
    />
  ) : page === 'transactions' ? (
    <TransactionsScreen
      device={device}
      dataState={dataState}
      batchMode={batchMode}
      items={items}
      accounts={hfAccounts}
      categories={hfCategories}
      today={today}
      periodLabel={periodLabel}
      actions={actions}
      onEntryOpen={() => setEntryOpen(true)}
      onBatchModeChange={setBatchMode}
      onRetry={retry}
    />
  ) : (
    <OverviewScreen
      device={device}
      scheme={scheme}
      dataState={dataState}
      items={items}
      freshLedger={false}
      accounts={hfAccounts}
      categories={hfCategories}
      today={today}
      view={overviewView}
      actions={actions}
      onRecord={() => setEntryOpen(true)}
      onRetry={retry}
      onOpenTransactions={() => navigate(ROUTES.transactions)}
    />
  )

  return (
    <ThemeRoot scheme={scheme} notificationPosition="top-center">
      <div className="hf-prod-root">
        <ShellFrame
          device={device}
          page={page}
          ledgerExpense={ledgerExpense}
          ledgerNote={ledgerNote}
          batchMode={batchMode}
          onPageChange={(target) => navigate(ROUTES[target])}
          onRecord={() => setEntryOpen(true)}
          overlay={(
            <EntryOverlay
              open={entryOpen}
              device={device}
              accounts={hfAccounts}
              categories={hfCategories}
              today={today}
              allowedTypes={[...allowedTypes]}
              onClose={() => setEntryOpen(false)}
              onSaved={onEntrySaved}
              onReopen={() => setEntryOpen(true)}
            />
          )}
        >
          {content}
        </ShellFrame>
      </div>
    </ThemeRoot>
  )
}
