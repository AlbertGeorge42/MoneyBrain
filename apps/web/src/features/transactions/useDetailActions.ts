/**
 * 交易详情的写动作：流水页与报表下钻抽屉共用同一份保存 / 删除 / 关联逻辑。
 * 提示文案与撤销令牌的处理只在这里写一次，避免出现「同一操作两套反馈」。
 */
import { useCallback } from 'react'
import { useLedger, type LedgerMutationOutcome } from '@/features/overview/ledgerStore'
import { useToast, type ToastVariant } from '@/features/shared/toastContext'
import type { TransactionPatch } from './ledgerOps'

export function useDetailActions(variant: ToastVariant = 'stack') {
  const { updateTransaction, deleteTransactions, linkRefund, undo } = useLedger()
  const { notify: pushToast } = useToast()
  const notify = useCallback(
    (message: string, undoRun?: () => void) =>
      pushToast(message, {
        variant,
        action: undoRun ? { label: '撤销', run: undoRun } : undefined,
      }),
    [pushToast, variant],
  )
  const runUndo = useCallback(
    (token: string, message: string) => {
      void undo(token).then((result) =>
        notify(result.ok ? message : `撤销失败：${result.error ?? '请重试'}`),
      )
    },
    [undo, notify],
  )

  const handleSave = useCallback(
    async (id: string, patch: TransactionPatch): Promise<LedgerMutationOutcome> => {
      const result = await updateTransaction(id, patch)
      if (!result.ok) {
        notify(`保存失败：${result.error ?? '请重试'}`)
        return result
      }
      notify(
        '已保存修改 · 账户余额与总览已同步',
        result.undoToken ? () => runUndo(result.undoToken!, '已撤销修改') : undefined,
      )
      return result
    },
    [updateTransaction, notify, runUndo],
  )

  const handleDelete = useCallback(
    async (id: string): Promise<LedgerMutationOutcome> => {
      const result = await deleteTransactions([id])
      if (!result.ok) {
        notify(`删除失败：${result.error ?? '请重试'}`)
        return result
      }
      notify(
        `已删除 ${result.succeeded} 笔流水`,
        result.undoToken ? () => runUndo(result.undoToken!, '已撤销删除') : undefined,
      )
      return result
    },
    [deleteTransactions, notify, runUndo],
  )

  const handleLinkRefund = useCallback(
    async (id: string, originalId: string | null): Promise<LedgerMutationOutcome> => {
      const result = await linkRefund(id, originalId)
      if (!result.ok) {
        notify(`关联失败：${result.error ?? '请重试'}`)
        return result
      }
      notify(originalId ? '已关联原交易' : '已解除原交易关联')
      return result
    },
    [linkRefund, notify],
  )

  return { handleSave, handleDelete, handleLinkRefund }
}
