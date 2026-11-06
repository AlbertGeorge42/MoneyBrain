import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { minor } from '@domain/index'
import type { Transaction } from '@contracts/types'
import { auditEventApi, transactionApi } from '@/services/api'
import { getApiErrorMessage } from '@/services/apiError'
import { unwrapApiData } from '@/services/apiResult'
import {
  addTransaction as applyTransaction,
  createSeedLedger,
  type Ledger,
  type NewTransactionInput,
} from './model'
import { todayLocal } from './apiLedger'
import {
  LedgerContext,
  type LedgerBatchCategoryOutcome,
  type LedgerCreateOutcome,
  type LedgerDataMode,
  type LedgerDeleteOutcome,
  type LedgerMutationOutcome,
} from './ledgerStore'
import {
  deleteTransactionsFromLedger,
  setTransactionsCategory,
  updateTransactionInLedger,
  type TransactionPatch,
} from '@/features/transactions/ledgerOps'

/** 展示用分类 id → 后端真实 id（种子账本没有映射，原样返回）。 */
function realCategoryId(ledger: Ledger, id: string): string {
  return ledger.ids?.categoryReal?.[id] ?? id
}

export function LedgerProvider({
  children,
  initialLedger,
  dataMode = 'seed',
  onRemoteChange,
}: {
  children: ReactNode
  initialLedger?: Ledger
  dataMode?: LedgerDataMode
  /** API 模式写成功后刷新真实数据（总览 / 流水 / 回收站）。 */
  onRemoteChange?: () => Promise<void>
}) {
  const apiMode = dataMode === 'api'
  const [ledger, setLedger] = useState<Ledger>(() => initialLedger ?? createSeedLedger())
  const ledgerRef = useRef(ledger)
  const undoSeq = useRef(0)
  // 6 秒撤销在两种模式下都真实可执行：种子模式恢复快照，API 模式回放审计事件。
  const undoRegistry = useRef(new Map<string, () => Promise<LedgerMutationOutcome>>())

  useEffect(() => {
    ledgerRef.current = ledger
  }, [ledger])

  // API 数据异步到达或重试后，把外部 Ledger 同步进来。
  // 种子模式没有 initialLedger，不受影响。
  useEffect(() => {
    if (initialLedger) setLedger(initialLedger)
  }, [initialLedger])

  const registerUndo = useCallback((run: () => Promise<LedgerMutationOutcome>): string => {
    undoSeq.current += 1
    const token = `undo-${undoSeq.current}`
    undoRegistry.current.set(token, run)
    return token
  }, [])

  const undo = useCallback(async (token: string): Promise<LedgerMutationOutcome> => {
    const run = undoRegistry.current.get(token)
    if (!run) return { ok: false, error: '撤销已过期，请到设置页回收站恢复' }
    undoRegistry.current.delete(token)
    return run()
  }, [])

  const refreshRemote = useCallback(async () => {
    if (!apiMode) return
    await onRemoteChange?.()
  }, [apiMode, onRemoteChange])

  const addTransaction = useCallback(
    async (input: NewTransactionInput): Promise<LedgerCreateOutcome> => {
      const magnitude = Math.round(Math.abs(input.amount))
      if (magnitude <= 0) return { ok: false, error: '金额需大于 0' }

      if (apiMode) {
        // 退款必须挂在原交易上；关联选择留到下一批，这里明确失败而不是假装保存。
        if (input.type === 'refund') {
          return { ok: false, error: '退款需要关联原交易，本批暂未接入，请改用支出或调整' }
        }
        const body: Partial<Transaction> = {
          type: input.type,
          amount: minor(input.type === 'adjustment' ? Math.round(input.amount) : magnitude),
          date: input.date ?? todayLocal(),
          accountId: input.accountId,
          note: input.note,
        }
        if (input.type === 'transfer') {
          body.toAccountId = input.toAccountId
          body.fee = minor(input.fee ?? 0)
        } else if (input.type !== 'adjustment') {
          body.categoryId = realCategoryId(ledgerRef.current, input.categoryId)
        }

        try {
          const created = await transactionApi.create(body).then(unwrapApiData)
          await refreshRemote()
          const undoToken = registerUndo(async () => {
            try {
              await transactionApi.delete(created.id).then(unwrapApiData)
              await refreshRemote()
              return { ok: true }
            } catch (error) {
              return { ok: false, error: getApiErrorMessage(error) }
            }
          })
          return { ok: true, id: created.id, undoToken }
        } catch (error) {
          return { ok: false, error: getApiErrorMessage(error) }
        }
      }

      const before = ledgerRef.current
      const nextNumber = before.transactions.reduce((max, transaction) => {
        const numeric = Number(transaction.id.replace(/\D/g, ''))
        return Number.isFinite(numeric) ? Math.max(max, numeric) : max
      }, 0)
      const id = `t${nextNumber + 1}`
      setLedger(applyTransaction(before, input))
      const undoToken = registerUndo(async () => {
        setLedger(before)
        return { ok: true }
      })
      return { ok: true, id, undoToken }
    },
    [apiMode, refreshRemote, registerUndo],
  )

  const updateTransaction = useCallback(
    async (id: string, patch: TransactionPatch): Promise<LedgerMutationOutcome> => {
      if (apiMode) {
        const body: Partial<Transaction> = {
          accountId: patch.accountId,
          date: patch.date,
          note: patch.note,
          amount: minor(patch.amount),
        }
        if (patch.type) body.type = patch.type
        // adjustment 不需要分类；其余类型把展示 id 翻回真实 id。
        if (patch.categoryId && patch.type !== 'adjustment') {
          body.categoryId = realCategoryId(ledgerRef.current, patch.categoryId)
        }
        try {
          await transactionApi.update(id, body).then(unwrapApiData)
          await refreshRemote()
          // 后端 update 尚未返回 auditEventId，API 模式暂不提供「撤销修改」。
          return { ok: true }
        } catch (error) {
          return { ok: false, error: getApiErrorMessage(error) }
        }
      }

      const before = ledgerRef.current
      setLedger(updateTransactionInLedger(before, id, patch))
      const undoToken = registerUndo(async () => {
        setLedger(before)
        return { ok: true }
      })
      return { ok: true, undoToken }
    },
    [apiMode, refreshRemote, registerUndo],
  )

  const deleteTransactions = useCallback(
    async (ids: readonly string[]): Promise<LedgerDeleteOutcome> => {
      if (ids.length === 0) {
        return { ok: false, error: '没有选中流水', succeeded: 0, auditEventIds: [], failedIds: [] }
      }

      if (apiMode) {
        const auditEventIds: string[] = []
        const failedIds: string[] = []
        const errors: string[] = []
        // 逐条调用 DELETE：没有批量端点，请求数 = 选中的笔数。
        for (const id of ids) {
          try {
            const result = await transactionApi.delete(id).then(unwrapApiData)
            auditEventIds.push(result.auditEventId)
          } catch (error) {
            failedIds.push(id)
            errors.push(getApiErrorMessage(error))
          }
        }
        await refreshRemote()

        const succeeded = auditEventIds.length
        if (succeeded === 0) {
          return { ok: false, error: errors[0] ?? '删除失败', succeeded, auditEventIds, failedIds }
        }
        const undoToken = registerUndo(async () => {
          const failures: string[] = []
          for (const eventId of auditEventIds) {
            try {
              await auditEventApi.undo(eventId).then(unwrapApiData)
            } catch (error) {
              failures.push(getApiErrorMessage(error))
            }
          }
          await refreshRemote()
          return failures.length > 0
            ? { ok: false, error: failures[0] }
            : { ok: true }
        })
        return errors.length > 0
          ? {
              ok: false,
              error: `已删除 ${succeeded} 笔，${errors.length} 笔失败：${errors[0]}`,
              succeeded,
              auditEventIds,
              failedIds,
              undoToken,
            }
          : { ok: true, succeeded, auditEventIds, failedIds: [], undoToken }
      }

      const before = ledgerRef.current
      setLedger(deleteTransactionsFromLedger(before, ids))
      const undoToken = registerUndo(async () => {
        setLedger(before)
        return { ok: true }
      })
      return { ok: true, succeeded: ids.length, auditEventIds: [], failedIds: [], undoToken }
    },
    [apiMode, refreshRemote, registerUndo],
  )

  const setTransactionCategory = useCallback(
    async (ids: readonly string[], categoryId: string): Promise<LedgerBatchCategoryOutcome> => {
      if (ids.length === 0) return { ok: false, error: '没有选中流水', succeeded: 0 }

      if (apiMode) {
        const realId = realCategoryId(ledgerRef.current, categoryId)
        let succeeded = 0
        const errors: string[] = []
        // 逐条 PUT：没有批量改分类端点，请求数 = 选中的笔数。
        for (const id of ids) {
          try {
            await transactionApi.update(id, { categoryId: realId }).then(unwrapApiData)
            succeeded += 1
          } catch (error) {
            errors.push(getApiErrorMessage(error))
          }
        }
        await refreshRemote()
        return errors.length > 0
          ? { ok: false, error: `已修改 ${succeeded} 笔，${errors.length} 笔失败：${errors[0]}`, succeeded }
          : { ok: true, succeeded }
      }

      const before = ledgerRef.current
      setLedger(setTransactionsCategory(before, ids, categoryId))
      const undoToken = registerUndo(async () => {
        setLedger(before)
        return { ok: true }
      })
      return { ok: true, succeeded: ids.length, undoToken }
    },
    [apiMode, refreshRemote, registerUndo],
  )

  const replaceLedger = useCallback(
    (next: Ledger) => {
      // API 模式下的设置页仍是本地预览，真实写库留到设置批次。
      if (apiMode) return
      setLedger(next)
    },
    [apiMode],
  )

  return (
    <LedgerContext.Provider
      value={{
        ledger,
        dataMode,
        addTransaction,
        updateTransaction,
        deleteTransactions,
        setTransactionCategory,
        undo,
        replaceLedger,
      }}
    >
      {children}
    </LedgerContext.Provider>
  )
}
