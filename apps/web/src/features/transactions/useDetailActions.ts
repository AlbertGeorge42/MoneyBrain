/**
 * 交易详情的写动作：流水页与报表下钻抽屉共用同一份保存 / 删除 / 关联逻辑。
 * 提示文案与撤销令牌的处理只在这里写一次，避免出现「同一操作两套反馈」。
 */
import { useCallback } from 'react'
import { useLedger, type LedgerMutationOutcome } from '@/features/overview/ledgerStore'
import { useToast, type ToastVariant } from '@/features/shared/toastContext'
import { todayLocal } from '@/features/overview/apiLedger'
import type { NewTransactionInput } from '@/features/overview/model'
import type { TransactionPatch } from './ledgerOps'

export function useDetailActions(variant: ToastVariant = 'stack') {
  const { addTransaction, updateTransaction, deleteTransactions, linkRefund, undo } = useLedger()
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

  /**
   * 从原交易创建一笔关联退款。记一笔表单已去掉退款 tab，这是退款的可写入口：
   * 退款是独立交易（冲减原交易），不是把原交易改成 refund 类型。
   */
  const handleCreateRefund = useCallback(
    async (originalId: string, categoryId: string, accountId: string, amount: number, note: string): Promise<LedgerMutationOutcome> => {
      const input: NewTransactionInput = {
        type: 'refund',
        categoryId,
        accountId,
        amount,
        note,
        date: todayLocal(),
        relatedTransactionId: originalId,
      }
      const result = await addTransaction(input)
      if (!result.ok) {
        notify(`退款创建失败：${result.error ?? '请重试'}`)
        return result
      }
      notify(
        '已创建关联退款 · 原交易可退金额已更新',
        result.undoToken ? () => runUndo(result.undoToken!, '已撤销退款') : undefined,
      )
      return result
    },
    [addTransaction, notify, runUndo],
  )

  return { handleSave, handleDelete, handleLinkRefund, handleCreateRefund }
}
