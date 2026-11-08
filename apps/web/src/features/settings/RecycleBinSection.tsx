/**
 * 设置页回收站（API 模式）
 *
 * 数据来自 GET /transactions/recycle-bin：软删除超过撤销窗口的记录会留在这里。
 * 「恢复」直接回放删除时的审计事件（POST /audit-events/:id/undo），与流水页的撤销同源。
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { auditEventApi, transactionApi } from '@/services/api'
import { getApiErrorMessage } from '@/services/apiError'
import { unwrapApiData } from '@/services/apiResult'
import { mapperFromLedger, toLedgerTransaction } from '@/features/overview/apiLedger'
import { formatDateLabel, getAccount, getCategoryName } from '@/features/overview/model'
import { HfButton } from '@/features/shared/HfButton'
import { signedAmountText } from '@/features/overview/format'
import type {
  Ledger,
  LedgerTransaction,
} from '@/features/overview/model'
import type { RecycleBinEntityItem } from '@contracts/types'
import type { LedgerMutationOutcome } from '@/features/overview/ledgerStore'

interface RecycleRow {
  id: string
  deleteEventId: string | null
  transaction: LedgerTransaction
}

const ENTITY_LABEL: Record<string, string> = {
  account: '账户',
  transaction_category: '分类',
}

const TYPE_LABEL: Record<string, string> = {
  asset: '资产',
  liability: '负债',
  income: '收入',
  expense: '支出',
  transfer: '转账',
}

function useRecycleBin(ledger: Ledger) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['hf', 'recycle-bin'],
    queryFn: () => transactionApi.getRecycleBin().then(unwrapApiData),
  })

  const rows: RecycleRow[] = useMemo(() => {
    const mapper = mapperFromLedger(ledger)
    return (query.data?.list ?? []).map((item) => ({
      id: item.transaction.id,
      deleteEventId: item.deleteEventId,
      transaction: toLedgerTransaction(item.transaction, mapper),
    }))
  }, [ledger, query.data])

  const entities: RecycleBinEntityItem[] = useMemo(
    () => [...(query.data?.accounts ?? []), ...(query.data?.categories ?? [])],
    [query.data],
  )

  const restoreMutation = useMutation({
    mutationFn: (eventId: string) => auditEventApi.undo(eventId).then(unwrapApiData),
  })

  const restore = async (deleteEventId: string | null): Promise<LedgerMutationOutcome> => {
    if (!deleteEventId) return { ok: false, error: '这条记录缺少审计事件，无法恢复' }
    try {
      await restoreMutation.mutateAsync(deleteEventId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hf', 'overview', 'ledger'] }),
        queryClient.invalidateQueries({ queryKey: ['hf', 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['hf', 'recycle-bin'] }),
        queryClient.invalidateQueries({ queryKey: ['hf', 'report'] }),
        queryClient.invalidateQueries({ queryKey: ['hf', 'budgets'] }),
      ])
      return { ok: true }
    } catch (error) {
      return { ok: false, error: getApiErrorMessage(error) }
    }
  }

  return {
    rows,
    entities,
    status: query.isError ? 'error' : query.isPending ? 'loading' : 'ready',
    refetch: () => void query.refetch(),
    restore,
  }
}

/** 只负责把真实回收站数量同步到设置页导航与摘要（无可见输出）。 */
export function RecycleBinCountProbe({
  ledger,
  onCount,
}: {
  ledger: Ledger
  onCount: (count: number) => void
}) {
  const { rows, entities } = useRecycleBin(ledger)
  const count = rows.length + entities.length
  useEffect(() => {
    onCount(count)
  }, [count, onCount])
  return null
}

export function RecycleBinPanel({ ledger }: { ledger: Ledger }) {
  const { rows, entities, status, refetch, restore } = useRecycleBin(ledger)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [error, setError] = useState('')

  if (status === 'loading') {
    return (
      <div className="mb-set-list-empty is-tall">
        <p>正在读取回收站…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mb-set-list-empty is-tall">
        <p>回收站读取失败</p>
        <span>检查 API 连接后重试。</span>
        <HfButton className="mb-set-btn is-ghost" onClick={refetch}>
          重试
        </HfButton>
      </div>
    )
  }

  if (rows.length === 0 && entities.length === 0) {
    return (
      <div className="mb-set-list-empty is-tall">
        <Trash2 size={24} />
        <p>回收站是空的</p>
        <span>删除流水 / 账户 / 分类后 6 秒内可在提示中撤销；过期后才会进入这里。</span>
      </div>
    )
  }

  const confirmRestore = async (key: string, deleteEventId: string | null) => {
    if (restoringId) return
    setRestoringId(key)
    setError('')
    const result = await restore(deleteEventId)
    setRestoringId(null)
    if (!result.ok) setError(result.error ?? '恢复失败，请重试')
  }

  return (
    <>
      {error && (
        <p className="mb-tx-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="mb-set-list">
        {entities.map((item) => {
          const key = `en-${item.deleteEventId}`
          return (
            <div key={key} className="mb-set-row">
              <span className="mb-set-drag" aria-hidden="true" />
              <span className="mb-set-icon">
                <Trash2 size={16} />
              </span>
              <span className="mb-set-name">{item.name}</span>
              <span className="mb-set-meta">
                {ENTITY_LABEL[item.entity] ?? item.entity}
                {TYPE_LABEL[item.detail] ? ` · ${TYPE_LABEL[item.detail]}` : ''} ·{' '}
                {formatDateLabel(item.deletedAt.slice(0, 10))}
              </span>
              <HfButton
                className="mb-set-btn is-ghost"
                title={item.canRestore ? undefined : '删除时级联删除了关联数据，无法自动恢复'}
                disabled={restoringId !== null || !item.canRestore}
                onClick={() => void confirmRestore(key, item.deleteEventId)}
              >
                {restoringId === key ? '恢复中…' : item.canRestore ? '恢复' : '不可恢复'}
              </HfButton>
            </div>
          )
        })}
        {rows.map((row) => (
          <div key={row.id} className="mb-set-row">
            <span className="mb-set-drag" aria-hidden="true" />
            <span className="mb-set-icon">
              <Trash2 size={16} />
            </span>
            <span className="mb-set-name">
              {row.transaction.note || getCategoryName(ledger, row.transaction.categoryId) || '未填写备注'}
            </span>
            <span className="mb-set-meta">
              {formatDateLabel(row.transaction.date)} ·{' '}
              {getAccount(ledger, row.transaction.accountId)?.name ?? '未知账户'} ·{' '}
              {signedAmountText(row.transaction)}
            </span>
            <HfButton
              className="mb-set-btn is-ghost"
              disabled={restoringId !== null || !row.deleteEventId}
              onClick={() => void confirmRestore(`tx-${row.id}`, row.deleteEventId)}
            >
              {restoringId === `tx-${row.id}` ? '恢复中…' : '恢复'}
            </HfButton>
          </div>
        ))}
      </div>
    </>
  )
}
