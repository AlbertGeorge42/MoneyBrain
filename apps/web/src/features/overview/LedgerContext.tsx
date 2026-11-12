import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { minor } from '@domain/index'
import type { Account, AccountCategory, Budget, Transaction } from '@contracts/types'
import {
  accountApi,
  accountCategoryApi,
  auditEventApi,
  budgetApi,
  transactionApi,
  transactionCategoryApi,
} from '@/services/api'
import { getApiErrorMessage } from '@/services/apiError'
import { unwrapApiData } from '@/services/apiResult'
import {
  type AccountKind,
  type CashFlowActivity,
  type Ledger,
  type LedgerAccount,
  type NewTransactionInput,
} from './model'
import { mapperFromLedger, todayLocal } from './apiLedger'
import {
  arrayMove,
  categoryDescendantIds,
} from '@/features/ledger-config/model'
import {
  LedgerContext,
  type LedgerAccountGroupInput,
  type LedgerAccountInput,
  type LedgerBatchCategoryOutcome,
  type LedgerBudgetInput,
  type LedgerCategoryInput,
  type LedgerCreateOutcome,
  type LedgerDeleteOutcome,
  type LedgerLabelUpdateInput,
  type LedgerMutationOutcome,
} from './ledgerStore'
import {
  type TransactionPatch,
} from '@/features/transactions/ledgerOps'

/** 展示用分类 id → 后端真实 id。 */
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

/** 账户写入时后端要求的 type：选定分组以分组为准，否则按展示性质回退。 */
function accountTypeForInput(input: LedgerAccountInput, ledger: Ledger): 'asset' | 'liability' {
  if (input.categoryId) {
    const group = ledger.accountCategories?.find((category) => category.id === input.categoryId)
    if (group) return group.type
  }
  return accountTypeForKind(input.kind)
}

export function LedgerProvider({
  children,
  initialLedger,
  onRemoteChange,
}: {
  children: ReactNode
  /** 初始账本必须由调用方提供：生产来自 API，测试用 dev-fixtures 构造。 */
  initialLedger: Ledger
  /** 写成功后刷新真实数据（总览 / 流水 / 回收站）。 */
  onRemoteChange?: () => Promise<void>
}) {
  const [ledger, setLedger] = useState<Ledger>(initialLedger)
  const ledgerRef = useRef(ledger)
  const undoSeq = useRef(0)
  // 6 秒撤销在两种模式下都真实可执行：种子模式恢复快照，API 模式回放审计事件。
  const undoRegistry = useRef(new Map<string, () => Promise<LedgerMutationOutcome>>())

  useEffect(() => {
    ledgerRef.current = ledger
  }, [ledger])

  // API 数据异步到达或重试后，把外部 Ledger 同步进来。
  useEffect(() => {
    setLedger(initialLedger)
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
    await onRemoteChange?.()
  }, [onRemoteChange])

  const addTransaction = useCallback(
    async (input: NewTransactionInput): Promise<LedgerCreateOutcome> => {
      const magnitude = Math.round(Math.abs(input.amount))
      if (magnitude <= 0) return { ok: false, error: '金额需大于 0' }

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
      // 退款可选关联原交易；未关联退款由后端按「只影响余额」记账。
      if (input.type === 'refund' && input.relatedTransactionId) {
        body.relatedTransactionId = input.relatedTransactionId
      }
      // 不计收支是逐笔标记：转账/调整本就不进收支统计，不写入该字段。
      if (input.excludeFromIncomeExpense && input.type !== 'transfer' && input.type !== 'adjustment') {
        body.excludeFromIncomeExpense = true
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
    },
    [refreshRemote, registerUndo],
  )

  const updateTransaction = useCallback(
    async (id: string, patch: TransactionPatch): Promise<LedgerMutationOutcome> => {
      const body: Partial<Transaction> = {
        accountId: patch.accountId,
        date: patch.date,
        note: patch.note,
        amount: minor(patch.amount),
      }
      if (patch.type) body.type = patch.type
      if (patch.excludeFromIncomeExpense !== undefined) {
        body.excludeFromIncomeExpense = patch.excludeFromIncomeExpense
      }
      // adjustment 不需要分类；其余类型把展示 id 翻回真实 id。
      if (patch.categoryId && patch.type !== 'adjustment') {
        body.categoryId = realCategoryId(ledgerRef.current, patch.categoryId)
      }
      try {
        await transactionApi.update(id, body).then(unwrapApiData)
        await refreshRemote()
        // 后端 update 尚未返回 auditEventId，暂不提供「撤销修改」。
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  const linkRefund = useCallback(
    async (id: string, originalId: string | null): Promise<LedgerMutationOutcome> => {
      try {
        await transactionApi.update(id, { relatedTransactionId: originalId }).then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  const deleteTransactions = useCallback(
    async (ids: readonly string[]): Promise<LedgerDeleteOutcome> => {
      if (ids.length === 0) {
        return { ok: false, error: '没有选中流水', succeeded: 0, auditEventIds: [], failedIds: [] }
      }

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
    },
    [refreshRemote, registerUndo],
  )

  const setTransactionCategory = useCallback(
    async (ids: readonly string[], categoryId: string): Promise<LedgerBatchCategoryOutcome> => {
      if (ids.length === 0) return { ok: false, error: '没有选中流水', succeeded: 0 }

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
    },
    [refreshRemote],
  )

  /* ===== 设置页：账户与分类的真实读写 ===== */

  const createAccount = useCallback(
    async (input: LedgerAccountInput): Promise<LedgerCreateOutcome> => {
      try {
        // 选定分组直接落该分类；未选时仍按展示性质回退到语义分类（旧表单兼容）。
        let categoryId = input.categoryId ?? undefined
        if (!categoryId) {
          const resolved = await resolveAccountCategory(input.kind)
          if (resolved.error) return { ok: false, error: resolved.error }
          categoryId = resolved.categoryId
        }
        const accounts = await accountApi.getAll().then(unwrapApiData)
        // 追加到列表末尾：sort 取现有最大值 + 1。
        const sort = accounts.reduce((max, account) => Math.max(max, account.sort), 0) + 1
        const created = await accountApi
          .create({
            name: input.name,
            type: accountTypeForInput(input, ledgerRef.current),
            categoryId,
            // 新建账户：表单里的「期初余额」直接作为 initialBalance，
            // 语义与 balance-at 一致（期初日期当天开始前），不再用当日余额倒推。
            initialBalance: minor(input.initialBalance ?? input.balance),
            initialBalanceDate: input.initialBalanceDate ?? todayLocal(),
            sort,
          })
          .then(unwrapApiData)
        await refreshRemote()
        return { ok: true, id: created.id }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  const updateAccount = useCallback(
    async (id: string, input: LedgerAccountInput): Promise<LedgerMutationOutcome> => {
      try {
        // 编辑时 categoryId 显式给出（含 null = 未分组）；省略才按性质回退。
        let categoryId = input.categoryId
        if (categoryId === undefined) {
          const resolved = await resolveAccountCategory(input.kind)
          if (resolved.error) return { ok: false, error: resolved.error }
          categoryId = resolved.categoryId ?? undefined
        }
        const body: Partial<Account> = {
          name: input.name,
          type: accountTypeForInput(input, ledgerRef.current),
          categoryId,
        }
        const currentBalance = ledgerRef.current.accounts.find((account) => account.id === id)?.balance ?? 0
        const accounts = await accountApi.getAll().then(unwrapApiData)
        const apiAccount = accounts.find((account) => account.id === id)
        if (!apiAccount) return { ok: false, error: '账户不存在' }
        const hasTransactions = ledgerRef.current.transactions.some(
          (transaction) => transaction.accountId === id || transaction.toAccountId === id,
        )
        const explicitInitial =
          input.initialBalance !== undefined ? input.initialBalance : Number(apiAccount.initialBalance)
        if (hasTransactions) {
          // 有流水后，期初余额冻结：改当前余额只能走「对账」，差额落 adjustment，
          // 绝不折算进 initialBalance（否则历史余额会被静默重写）。
          if (input.initialBalance !== undefined && explicitInitial !== Number(apiAccount.initialBalance)) {
            return { ok: false, error: '账户已有流水，期初余额不可修改；改当前余额会自动生成平账记录' }
          }
        } else {
          body.initialBalance = minor(explicitInitial)
          const nextDate = input.initialBalanceDate ?? apiAccount.initialBalanceDate
          if (nextDate) body.initialBalanceDate = nextDate
        }
        await accountApi.update(id, body).then(unwrapApiData)
        if (hasTransactions && input.balance !== currentBalance) {
          // 与一键对账共用同一后端路径：差额可见、可筛选、可撤销。
          await accountApi
            .reconcile(id, { date: todayLocal(), actualBalance: minor(input.balance) })
            .then(unwrapApiData)
        }
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  const deleteAccount = useCallback(
    async (id: string): Promise<LedgerMutationOutcome> => {
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
    [refreshRemote, registerUndo],
  )

  /** 同分组账户按绝对位置重排（拖拽排序用）。 */
  const reorderAccountTo = useCallback(
    async (id: string, targetIndex: number): Promise<LedgerMutationOutcome> => {
      const current = ledgerRef.current
      const account = current.accounts.find((item) => item.id === id)
      if (!account) return { ok: false, error: '账户不存在' }
      // 账户顺序只在同一分组内调整；未分组按性质归并。
      const groupKey = (item: LedgerAccount) => item.categoryId ?? `kind:${item.kind}`
      const siblings = current.accounts.filter((item) => groupKey(item) === groupKey(account))
      const oldIndex = siblings.findIndex((item) => item.id === id)
      if (
        oldIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= siblings.length ||
        targetIndex === oldIndex
      ) {
        return { ok: false, error: '位置无效' }
      }

      try {
        const newOrder = arrayMove(siblings, oldIndex, targetIndex)
        const accounts = await accountApi.getAll().then(unwrapApiData)
        const categoryById = new Map(accounts.map((item) => [item.id, item.categoryId]))
        await accountApi
          .updateSort(
            newOrder.map((item, sort) => ({
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
    [refreshRemote],
  )

  /* -------- 账户分组（后端 AccountCategory；只负责组织与浏览，不参与计算） -------- */

  const createAccountGroup = useCallback(
    async (input: LedgerAccountGroupInput): Promise<LedgerCreateOutcome> => {
      try {
        const created = await accountCategoryApi
          .create({ name: input.name, type: input.type, parentId: null, iconKey: input.iconKey })
          .then(unwrapApiData)
        await refreshRemote()
        return { ok: true, id: created.id }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  const updateAccountGroup = useCallback(
    async (id: string, input: LedgerLabelUpdateInput): Promise<LedgerMutationOutcome> => {
      try {
        await accountCategoryApi.update(id, input).then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  const deleteAccountGroup = useCallback(
    async (id: string): Promise<LedgerMutationOutcome> => {
      try {
        // 有账户引用时后端拒绝删除并返回原因；前端不静默清空引用。
        await accountCategoryApi.delete(id).then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  /** 同归属分组按绝对位置重排（拖拽排序用）；未分组 / 种子分组不可拖。 */
  const reorderAccountGroupTo = useCallback(
    async (id: string, targetIndex: number): Promise<LedgerMutationOutcome> => {
      const current = (ledgerRef.current.accountCategories ?? []).find(
        (category) => category.id === id,
      )
      if (!current) return { ok: false, error: '分组不存在' }
      // 排序只在同一归属的兄弟分组之间调整（未分组占位不在后端分组表）。
      const siblings = (ledgerRef.current.accountCategories ?? []).filter(
        (category) => category.type === current.type,
      )
      const oldIndex = siblings.findIndex((category) => category.id === id)
      if (
        oldIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= siblings.length ||
        targetIndex === oldIndex
      ) {
        return { ok: false, error: '位置无效' }
      }
      try {
        const newOrder = arrayMove(siblings, oldIndex, targetIndex)
        await accountCategoryApi
          .updateSort(
            newOrder.map((category, sort) => ({
              id: category.id,
              sort,
              parentId: null,
            })),
          )
          .then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  const createCategory = useCallback(
    async (input: LedgerCategoryInput): Promise<LedgerCreateOutcome> => {
      try {
        const mapper = mapperFromLedger(ledgerRef.current)
        const parentId = input.parentId ? mapper.realId(input.parentId) : null
        const created = await transactionCategoryApi
          .create({ name: input.name, type: input.type, parentId, iconKey: input.iconKey })
          .then(unwrapApiData)
        await refreshRemote()
        return { ok: true, id: created.id }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  const updateCategory = useCallback(
    async (id: string, input: LedgerLabelUpdateInput): Promise<LedgerMutationOutcome> => {
      try {
        const mapper = mapperFromLedger(ledgerRef.current)
        await transactionCategoryApi.update(mapper.realId(id), input).then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  const setCategoryCashFlow = useCallback(
    async (id: string, activity: CashFlowActivity | null): Promise<LedgerMutationOutcome> => {
      try {
        const mapper = mapperFromLedger(ledgerRef.current)
        // 报表按每笔流水所属分类的 cashFlowType 分组；子分类不随父变化就会留下旧口径。
        const ids = [id, ...categoryDescendantIds(ledgerRef.current, id)]
        for (const categoryId of ids) {
          await transactionCategoryApi
            .update(mapper.realId(categoryId), { cashFlowType: activity })
            .then(unwrapApiData)
        }
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        // 级联写到一半失败时先重取，页面展示以库内实际状态为准。
        await refreshRemote()
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [refreshRemote],
  )

  const moveCategory = useCallback(
    async (id: string, parentId: string | null): Promise<LedgerMutationOutcome> => {
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
    [refreshRemote],
  )

  const deleteCategory = useCallback(
    async (id: string, transferToId?: string): Promise<LedgerMutationOutcome> => {
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
    [refreshRemote, registerUndo],
  )

  /** 同级分类按绝对位置重排（拖拽排序用）。 */
  const reorderCategoryTo = useCallback(
    async (id: string, targetIndex: number): Promise<LedgerMutationOutcome> => {
      const current = ledgerRef.current
      const category = current.categories.find((item) => item.id === id)
      if (!category) return { ok: false, error: '分类不存在' }
      const siblings = current.categories.filter(
        (item) => item.type === category.type && item.parentId === category.parentId,
      )
      const oldIndex = siblings.findIndex((item) => item.id === id)
      if (
        oldIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= siblings.length ||
        targetIndex === oldIndex
      ) {
        return { ok: false, error: '位置无效' }
      }

      try {
        const mapper = mapperFromLedger(current)
        const newOrder = arrayMove(siblings, oldIndex, targetIndex)
        const parentId = category.parentId ? mapper.realId(category.parentId) : null
        await transactionCategoryApi
          .updateSort(
            newOrder.map((item, sort) => ({
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
    [refreshRemote],
  )

  /** 预算表单 → /budgets 请求体：分类展示 id 翻成真实 id，金额转分。 */
  const budgetBody = useCallback((input: LedgerBudgetInput): Partial<Budget> => {
    const body: Partial<Budget> = {
      name: input.name,
      type: input.type,
      amount: minor(input.limit),
      period: input.period,
      accountId: input.accountId,
    }
    if (input.categoryId) body.categoryId = realCategoryId(ledgerRef.current, input.categoryId)
    if (input.toAccountId) body.toAccountId = input.toAccountId
    // 0 是合法的天偏移（周一 / 周期首日），只能用 != null 判断；缺省表示按周期末。
    if (input.transactionTime != null) body.transactionTime = input.transactionTime
    return body
  }, [])

  const createBudget = useCallback(
    async (input: LedgerBudgetInput): Promise<LedgerCreateOutcome> => {
      // 真实后端要求预算必须落在具体账户与分类上，不做静默兜底。
      if (!input.accountId) return { ok: false, error: '真实账本要求预算绑定账户，请选择账户' }
      if (!input.categoryId) return { ok: false, error: '真实账本要求预算绑定分类，请选择分类' }
      try {
        const created = await budgetApi.create(budgetBody(input)).then(unwrapApiData)
        await refreshRemote()
        return { ok: true, id: created.id }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [budgetBody, refreshRemote],
  )

  const updateBudget = useCallback(
    async (id: string, input: LedgerBudgetInput): Promise<LedgerMutationOutcome> => {
      if (!input.accountId) return { ok: false, error: '真实账本要求预算绑定账户，请选择账户' }
      if (!input.categoryId) return { ok: false, error: '真实账本要求预算绑定分类，请选择分类' }
      try {
        await budgetApi.update(id, budgetBody(input)).then(unwrapApiData)
        await refreshRemote()
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getApiErrorMessage(error) }
      }
    },
    [budgetBody, refreshRemote],
  )

  const deleteBudget = useCallback(
    async (id: string): Promise<LedgerMutationOutcome> => {
      try {
        // 后端是硬删除且不回传审计事件；先取完整预算快照，撤销时按原 id 重建。
        const snapshot = (await budgetApi.getAll().then(unwrapApiData)).find(
          (budget) => budget.id === id,
        )
        await budgetApi.delete(id).then(unwrapApiData)
        await refreshRemote()
        const undoToken = registerUndo(async () => {
          if (!snapshot) return { ok: false, error: '撤销快照已丢失，请重新创建预算' }
          try {
            await budgetApi
              .create({
                id: snapshot.id,
                name: snapshot.name,
                type: snapshot.type,
                amount: snapshot.amount,
                period: snapshot.period,
                startDate: snapshot.startDate,
                endDate: snapshot.endDate,
                transactionTime: snapshot.transactionTime,
                note: snapshot.note,
                isActive: snapshot.isActive,
                accountId: snapshot.accountId,
                toAccountId: snapshot.toAccountId,
                categoryId: snapshot.categoryId,
              })
              .then(unwrapApiData)
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
    [refreshRemote, registerUndo],
  )

  return (
    <LedgerContext.Provider
      value={{
        ledger,
        addTransaction,
        updateTransaction,
        linkRefund,
        deleteTransactions,
        setTransactionCategory,
        createAccount,
        updateAccount,
        deleteAccount,
        reorderAccountTo,
        createAccountGroup,
        updateAccountGroup,
        deleteAccountGroup,
        reorderAccountGroupTo,
        createCategory,
        updateCategory,
        setCategoryCashFlow,
        moveCategory,
        deleteCategory,
        reorderCategoryTo,
        createBudget,
        updateBudget,
        deleteBudget,
        undo,
      }}
    >
      {children}
    </LedgerContext.Provider>
  )
}
