import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { minor } from '@domain/index'
import type { Account, AccountCategory, Transaction } from '@contracts/types'
import { accountApi, accountCategoryApi, auditEventApi, transactionApi, transactionCategoryApi } from '@/services/api'
import { getApiErrorMessage } from '@/services/apiError'
import { unwrapApiData } from '@/services/apiResult'
import {
  addTransaction as applyTransaction,
  createSeedLedger,
  type AccountKind,
  type Ledger,
  type NewTransactionInput,
} from './model'
import { mapperFromLedger, todayLocal } from './apiLedger'
import {
  addAccount as addAccountToLedger,
  addCategory as addCategoryToLedger,
  removeAccount as removeAccountFromLedger,
  removeCategory as removeCategoryFromLedger,
  reorderAccount as reorderAccountInLedger,
  reorderCategory as reorderCategoryInLedger,
  transferCategoryTransactions,
  updateAccount as updateAccountInLedger,
  updateCategory as updateCategoryInLedger,
} from '@/features/settings/settingsModel'
import {
  LedgerContext,
  type LedgerAccountInput,
  type LedgerBatchCategoryOutcome,
  type LedgerCategoryInput,
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

/** 设置页的账户性质 → 后端账户类型。 */
function accountTypeForKind(kind: AccountKind): 'asset' | 'liability' {
  return kind === 'credit' ? 'liability' : 'asset'
}

/**
 * 账户性质在后端由「账户分类标记」决定（现金等价 / 投资 / 其他 / 负债）。
 * 设置页只暴露四类性质，写入时映射到对应的顶级账户分类，保证读回后性质不变。
 */
async function resolveAccountCategory(
  kind: AccountKind,
): Promise<{ categoryId?: string; error?: string }> {
  const categories: AccountCategory[] = await accountCategoryApi.getAll().then(unwrapApiData)
  const type = accountTypeForKind(kind)
  const roots = categories.filter((category) => !category.parentId && category.type === type)
  if (kind === 'credit') {
    return roots[0] ? { categoryId: roots[0].id } : { error: '缺少负债账户分类' }
  }
  if (kind === 'cash') {
    const matched = roots.find((category) => category.isCashEquivalent)
    return matched ? { categoryId: matched.id } : { error: '缺少「现金及等价物」账户分类' }
  }
  if (kind === 'investment') {
    const matched = roots.find((category) => category.isInvestment)
    return matched ? { categoryId: matched.id } : { error: '缺少「投资资产」账户分类' }
  }
  const other = roots.find((category) => !category.isCashEquivalent && !category.isInvestment)
  return { categoryId: (other ?? roots[0])?.id }
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

  /* ===== 设置页：账户与分类的真实读写 ===== */

  const createAccount = useCallback(
    async (input: LedgerAccountInput): Promise<LedgerCreateOutcome> => {
      if (!apiMode) {
        setLedger(addAccountToLedger(ledgerRef.current, input))
        return { ok: true }
      }
      try {
        const resolved = await resolveAccountCategory(input.kind)
        if (resolved.error) return { ok: false, error: resolved.error }
        const accounts = await accountApi.getAll().then(unwrapApiData)
        // 追加到列表末尾：sort 取现有最大值 + 1。
        const sort = accounts.reduce((max, account) => Math.max(max, account.sort), 0) + 1
        const created = await accountApi
          .create({
            name: input.name,
            type: accountTypeForKind(input.kind),
            categoryId: resolved.categoryId,
            initialBalance: minor(input.balance),
            initialBalanceDate: todayLocal(),
            sort,
          })
          .then(unwrapApiData)
        await refreshRemote()
        return { ok: true, id: created.id }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [apiMode, refreshRemote],
  )

  const updateAccount = useCallback(
    async (id: string, input: LedgerAccountInput): Promise<LedgerMutationOutcome> => {
      if (!apiMode) {
        setLedger(updateAccountInLedger(ledgerRef.current, id, input))
        return { ok: true }
      }
      try {
        const resolved = await resolveAccountCategory(input.kind)
        if (resolved.error) return { ok: false, error: resolved.error }
        const body: Partial<Account> = {
          name: input.name,
          type: accountTypeForKind(input.kind),
          categoryId: resolved.categoryId,
        }
        const currentBalance = ledgerRef.current.accounts.find((account) => account.id === id)?.balance ?? 0
        if (input.balance !== currentBalance) {
          const accounts = await accountApi.getAll().then(unwrapApiData)
          const apiAccount = accounts.find((account) => account.id === id)
          if (!apiAccount) return { ok: false, error: '账户不存在' }
          // 期初日期不变，用差额修正期初：balance-at 的当日余额与面板显示一致。
          body.initialBalance = minor(
            Number(apiAccount.initialBalance) + (input.balance - currentBalance),
          )
        }
        await accountApi.update(id, body).then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [apiMode, refreshRemote],
  )

  const deleteAccount = useCallback(
    async (id: string): Promise<LedgerMutationOutcome> => {
      if (!apiMode) {
        const before = ledgerRef.current
        setLedger(removeAccountFromLedger(before, id))
        const undoToken = registerUndo(async () => {
          setLedger(before)
          return { ok: true }
        })
        return { ok: true, undoToken }
      }
      try {
        // 非 force：有交易 / 预算 / 快照等引用时由后端拒绝，前端原样显示原因。
        const result = await accountApi.delete(id).then(unwrapApiData)
        await refreshRemote()
        const undoToken = registerUndo(async () => {
          try {
            await auditEventApi.undo(result.auditEventId).then(unwrapApiData)
            await refreshRemote()
            return { ok: true }
          } catch (error) {
            return { ok: false, error: getApiErrorMessage(error) }
          }
        })
        return { ok: true, undoToken }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [apiMode, refreshRemote, registerUndo],
  )

  const reorderAccount = useCallback(
    async (id: string, direction: 'up' | 'down'): Promise<LedgerMutationOutcome> => {
      const current = ledgerRef.current
      const account = current.accounts.find((item) => item.id === id)
      if (!account) return { ok: false, error: '账户不存在' }
      const siblings = current.accounts.filter((item) => item.kind === account.kind)
      const index = siblings.findIndex((item) => item.id === id)
      const target = index + (direction === 'up' ? -1 : 1)
      if (target < 0 || target >= siblings.length) {
        return { ok: false, error: direction === 'up' ? '已经在最前面了' : '已经在最后面了' }
      }

      if (!apiMode) {
        setLedger(reorderAccountInLedger(current, id, direction))
        return { ok: true }
      }
      try {
        const swapped = [...siblings]
        ;[swapped[index], swapped[target]] = [swapped[target], swapped[index]]
        const accounts = await accountApi.getAll().then(unwrapApiData)
        const categoryById = new Map(accounts.map((item) => [item.id, item.categoryId]))
        await accountApi
          .updateSort(
            swapped.map((item, sort) => ({
              id: item.id,
              sort,
              categoryId: categoryById.get(item.id) ?? null,
            })),
          )
          .then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [apiMode, refreshRemote],
  )

  const createCategory = useCallback(
    async (input: LedgerCategoryInput): Promise<LedgerCreateOutcome> => {
      if (!apiMode) {
        setLedger(
          addCategoryToLedger(ledgerRef.current, {
            name: input.name,
            type: input.type,
            parentId: input.parentId ?? undefined,
          }),
        )
        return { ok: true }
      }
      try {
        const mapper = mapperFromLedger(ledgerRef.current)
        const parentId = input.parentId ? mapper.realId(input.parentId) : null
        const created = await transactionCategoryApi
          .create({ name: input.name, type: input.type, parentId })
          .then(unwrapApiData)
        await refreshRemote()
        return { ok: true, id: created.id }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [apiMode, refreshRemote],
  )

  const updateCategory = useCallback(
    async (id: string, name: string): Promise<LedgerMutationOutcome> => {
      if (!apiMode) {
        setLedger(updateCategoryInLedger(ledgerRef.current, id, name))
        return { ok: true }
      }
      try {
        const mapper = mapperFromLedger(ledgerRef.current)
        await transactionCategoryApi.update(mapper.realId(id), { name }).then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [apiMode, refreshRemote],
  )

  const moveCategory = useCallback(
    async (id: string, parentId: string | null): Promise<LedgerMutationOutcome> => {
      if (!apiMode) {
        // 种子模式直接改层级（保持与原有 moveCategory 一致）。
        setLedger((current) => ({
          ...current,
          categories: current.categories.map((category) =>
            category.id === id ? { ...category, parentId: parentId ?? undefined } : category,
          ),
        }))
        return { ok: true }
      }
      try {
        const mapper = mapperFromLedger(ledgerRef.current)
        await transactionCategoryApi
          .move(mapper.realId(id), { newParentId: parentId ? mapper.realId(parentId) : null })
          .then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [apiMode, refreshRemote],
  )

  const deleteCategory = useCallback(
    async (id: string, transferToId?: string): Promise<LedgerMutationOutcome> => {
      if (!apiMode) {
        const before = ledgerRef.current
        const next = transferToId
          ? transferCategoryTransactions(before, id, transferToId)
          : before
        setLedger(removeCategoryFromLedger(next, id))
        const undoToken = registerUndo(async () => {
          setLedger(before)
          return { ok: true }
        })
        return { ok: true, undoToken }
      }
      try {
        const mapper = mapperFromLedger(ledgerRef.current)
        const params = transferToId
          ? { transferToCategoryId: mapper.realId(transferToId) }
          : undefined
        const result = await transactionCategoryApi
          .delete(mapper.realId(id), params)
          .then(unwrapApiData)
        await refreshRemote()
        const undoToken = registerUndo(async () => {
          try {
            await auditEventApi.undo(result.auditEventId).then(unwrapApiData)
            await refreshRemote()
            return { ok: true }
          } catch (error) {
            return { ok: false, error: getApiErrorMessage(error) }
          }
        })
        return { ok: true, undoToken }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [apiMode, refreshRemote, registerUndo],
  )

  const reorderCategory = useCallback(
    async (id: string, direction: 'up' | 'down'): Promise<LedgerMutationOutcome> => {
      const current = ledgerRef.current
      const category = current.categories.find((item) => item.id === id)
      if (!category) return { ok: false, error: '分类不存在' }
      const siblings = current.categories.filter(
        (item) => item.type === category.type && item.parentId === category.parentId,
      )
      const index = siblings.findIndex((item) => item.id === id)
      const target = index + (direction === 'up' ? -1 : 1)
      if (target < 0 || target >= siblings.length) {
        return { ok: false, error: direction === 'up' ? '已经在最前面了' : '已经在最后面了' }
      }

      if (!apiMode) {
        setLedger(reorderCategoryInLedger(current, id, direction))
        return { ok: true }
      }
      try {
        const mapper = mapperFromLedger(current)
        const swapped = [...siblings]
        ;[swapped[index], swapped[target]] = [swapped[target], swapped[index]]
        const parentId = category.parentId ? mapper.realId(category.parentId) : null
        await transactionCategoryApi
          .updateSort(
            swapped.map((item, sort) => ({
              id: mapper.realId(item.id),
              sort,
              parentId,
            })),
          )
          .then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [apiMode, refreshRemote],
  )

  const replaceLedger = useCallback(
    (next: Ledger) => {
      // API 模式下尚未接线的分区（导入导出 / 现金流 / 清空）保持只读预览。
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
        createAccount,
        updateAccount,
        deleteAccount,
        reorderAccount,
        createCategory,
        updateCategory,
        moveCategory,
        deleteCategory,
        reorderCategory,
        undo,
        replaceLedger,
      }}
    >
      {children}
    </LedgerContext.Provider>
  )
}
