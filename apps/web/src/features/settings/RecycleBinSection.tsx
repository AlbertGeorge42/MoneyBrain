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
import { signedAmountText } from '@/features/overview/format'
import type { Ledger, LedgerTransaction } from '@/features/overview/model'
import type { LedgerMutationOutcome } from '@/features/overview/ledgerStore'

interface RecycleRow {
  id: string
  deleteEventId: string | null
  transaction: LedgerTransaction
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

  const restoreMutation = useMutation({
    mutationFn: (eventId: string) => auditEventApi.undo(eventId).then(unwrapApiData),
  })

  const restore = async (row: RecycleRow): Promise<LedgerMutationOutcome> => {
    if (!row.deleteEventId) return { ok: false, error: '这条记录缺少审计事件，无法恢复' }
    try {
      await restoreMutation.mutateAsync(row.deleteEventId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hf', 'overview', 'ledger'] }),
        queryClient.invalidateQueries({ queryKey: ['hf', 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['hf', 'recycle-bin'] }),
      ])
      return { ok: true }
    } catch (error) {
      return { ok: false, error: getApiErrorMessage(error) }
    }
  }

  return {
    rows,
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
  const { rows } = useRecycleBin(ledger)
  const count = rows.length
  useEffect(() => {
    onCount(count)
  }, [count, onCount])
  return null
}

export function RecycleBinPanel({ ledger }: { ledger: Ledger }) {
  const { rows, status, refetch, restore } = useRecycleBin(ledger)
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
        <button type="button" className="mb-set-btn is-ghost" onClick={refetch}>
          重试
        </button>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="mb-set-list-empty is-tall">
        <Trash2 size={24} />
        <p>回收站是空的</p>
        <span>删除流水后 6 秒内可在提示中撤销；过期后才会进入这里。</span>
      </div>
    )
  }

  const confirmRestore = async (row: RecycleRow) => {
    if (restoringId) return
    setRestoringId(row.id)
    setError('')
    const result = await restore(row)
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
            <button
              type="button"
              className="mb-set-btn is-ghost"
              disabled={restoringId !== null || !row.deleteEventId}
              onClick={() => void confirmRestore(row)}
            >
              {restoringId === row.id ? '恢复中…' : '恢复'}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
