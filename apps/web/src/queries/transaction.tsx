import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'antd'
import { transactionApi, auditEventApi } from '../services/api'
import { unwrapApiData } from '../services/apiResult'
import type { Transaction } from '../services/api'
import { queryKeys } from './keys'
import { invalidateLedger } from './ledger'
import { useNotify } from '../hooks/useNotify'
import { getApiErrorMessage } from '../services/apiError'

export function useTransactions(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.transactions.list(params),
    queryFn: () => transactionApi.getAll(params).then(unwrapApiData),
  })
}

export function useTransactionStats(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.transactions.stats(params),
    queryFn: () => transactionApi.getStats(params).then(unwrapApiData),
  })
}

export function useTransactionEarliestDate() {
  return useQuery({
    queryKey: queryKeys.transactions.earliest,
    queryFn: () => transactionApi.getEarliestDate().then(unwrapApiData),
  })
}

export function useTransactionRefundableList() {
  return useQuery({
    queryKey: queryKeys.transactions.refundable,
    queryFn: () => transactionApi.getRefundableList().then(unwrapApiData),
  })
}

/** 详情页修改历史（B2-4）。 */
export function useTransactionHistory(transactionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transactions.history(transactionId ?? ''),
    queryFn: () => transactionApi.getHistory(transactionId!).then(unwrapApiData),
    enabled: Boolean(transactionId),
  })
}

/** 回收站（B2-4）：已删除交易可查。 */
export function useRecycleBin() {
  return useQuery({
    queryKey: queryKeys.transactions.recycleBin,
    queryFn: () => transactionApi.getRecycleBin().then(unwrapApiData),
  })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Transaction>) => transactionApi.create(data),
    onSuccess: () => invalidateLedger(queryClient),
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Transaction> }) => transactionApi.update(id, data),
    onSuccess: () => invalidateLedger(queryClient),
  })
}

/** 撤销一条审计事件（反向写入）；删除提示条与回收站恢复共用。 */
export function useUndoAuditEvent() {
  const queryClient = useQueryClient()
  const notify = useNotify()
  return useMutation({
    mutationFn: (eventId: string) => auditEventApi.undo(eventId).then(unwrapApiData),
    onSuccess: (restored: Transaction) => {
      notify.success(`已恢复：${restored.note ?? ''}`.trim() || '已撤销删除')
      return invalidateLedger(queryClient)
    },
    onError: (error) => {
      notify.error(getApiErrorMessage(error, '撤销失败'))
    },
  })
}

/**
 * 删除交易（软删除）：不做二次确认，删除后提示「已删除 · 撤销」。
 * 撤销 = 调审计事件反向写入，与回收站恢复同一条路径。
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  const notify = useNotify()
  const undoMutation = useUndoAuditEvent()

  return useMutation({
    mutationFn: (id: string) => transactionApi.delete(id).then(unwrapApiData),
    onSuccess: (result: { message: string; auditEventId: string }) => {
      notify.open({
        type: 'success',
        content: (
          <span>
            已删除
            <Button
              type="link"
              size="small"
              style={{ padding: '0 4px', height: 'auto' }}
              onClick={() => undoMutation.mutate(result.auditEventId)}
            >
              撤销
            </Button>
          </span>
        ),
        duration: 8,
      })
      return invalidateLedger(queryClient)
    },
    onError: (error) => {
      notify.error(getApiErrorMessage(error, '删除失败'))
    },
  })
}
