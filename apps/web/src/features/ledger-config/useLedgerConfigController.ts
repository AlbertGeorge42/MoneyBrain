/**
 * 账户 / 收支分类管理的共享编排。
 *
 * 只承载“管理账本数据”的临时 UI 状态与写操作，不放进全局 Context：
 * 设置页和报表页各调用一次，互不影响抽屉状态。数据源仍是 LedgerProvider。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { useLedger } from '@/features/overview/ledgerStore'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import {
  setExpandedKeys,
  toggleExpandedKey,
  type ExpandedKeys,
} from '@/features/shared/foldState'
import type { ToastOptions } from '@/features/shared/toastContext'
import { transactionCategoryApi } from '@/services/api'
import { getApiErrorMessage } from '@/services/apiError'
import { unwrapApiData } from '@/services/apiResult'
import type { CashFlowActivityKey } from '@domain/index'
import type { TxType } from '@/features/overview/model'
import type { Editor, EditorSaveValue } from './EditorSheet'
import type { Mover } from './MoverSheet'
import type { CashflowTab } from './CashflowSection'
import {
  accountGroupCount,
  accountGroupsForType,
  accountTxCount,
  categoryRows,
  type AccountGroup,
  type AccountRow,
  type AssetMarkId,
  type CategoryRow,
  type CategoryTab,
} from './model'

export interface LedgerConfigControllerOptions {
  /** 宿主页面的轻提示；报表页可在此绑定 reports 变体。 */
  notify: (message: string, options?: ToastOptions) => void
  /** 写库成功后的宿主回调：报表页用它重取当前报表并校正下钻。 */
  onAfterWrite?: () => void
}

/** 拖拽落点所属的同级列表：本地快照与写库都按这个 scope 定位。 */
export type ConfigOrderScope =
  | { kind: 'category'; type: CategoryTab; parentId?: string }
  | { kind: 'group'; type: 'asset' | 'liability' }
  | { kind: 'account'; groupId: string }

function orderScopeKey(scope: ConfigOrderScope): string {
  if (scope.kind === 'category') return `cat:${scope.type}:${scope.parentId ?? 'root'}`
  if (scope.kind === 'group') return `grp:${scope.type}`
  return `acc:${scope.groupId}`
}

/** 用本地 id 顺序覆盖派生列表；新出现而未记录的行追加到末尾，避免脏数据吞行。 */
function withOrder<T extends { id: string }>(
  items: readonly T[],
  ids: readonly string[] | undefined,
): T[] {
  if (!ids) return [...items]
  const byId = new Map(items.map((item) => [item.id, item]))
  const ordered = ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item))
  const known = new Set(ids)
  return ordered.concat(items.filter((item) => !known.has(item.id)))
}

export function useLedgerConfigController({
  notify,
  onAfterWrite,
}: LedgerConfigControllerOptions) {
  const {
    ledger,
    createAccount,
    updateAccount,
    deleteAccount: deleteAccountRemote,
    reorderAccountTo,
    createAccountGroup,
    updateAccountGroup,
    deleteAccountGroup: deleteAccountGroupRemote,
    reorderAccountGroupTo,
    setAccountCategoryMark,
    createCategory,
    updateCategory,
    setCategoryCashFlow,
    moveCategory,
    deleteCategory: deleteCategoryRemote,
    reorderCategoryTo,
    undo,
  } = useLedger()

  const [accountTab, setAccountTab] = useState<'asset' | 'liability'>('asset')
  /** 真实库里有大量导入残留的空分组；默认只看有账户的分组，可一键显示。 */
  const [showEmptyGroups, setShowEmptyGroups] = useState(false)
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('expense')
  const [cashTab, setCashTab] = useState<CashflowTab>('asset')
  /** 所有折叠列表默认收起：只记用户显式展开过的分组 / 分类。 */
  const [expandedKeys, setExpanded] = useState<ExpandedKeys>(() => new Set())
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [mover, setMover] = useState<Mover | null>(null)
  const [deleteTransfer, setDeleteTransfer] = useState<{ row: CategoryRow; type: TxType } | null>(
    null,
  )
  const [editorError, setEditorError] = useState<string | null>(null)
  const [editorSaving, setEditorSaving] = useState(false)
  const [moverError, setMoverError] = useState<string | null>(null)
  const [moverSaving, setMoverSaving] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  useEffect(() => {
    setEditorError(null)
    setEditorSaving(false)
  }, [editor])

  useEffect(() => {
    setMoverError(null)
    setMoverSaving(false)
  }, [mover])

  useEffect(() => {
    setDeleteError(null)
    setDeleteSaving(false)
  }, [deleteTransfer])

  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => setConfirming(null), 3000)
    return () => window.clearTimeout(timer)
  }, [confirming])

  useEffect(() => {
    if (!menuOpen) return
    const handle = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.mb-set-more-wrap')) setMenuOpen(null)
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [menuOpen])

  /**
   * dnd-kit 官方 sortable 的本地 items：onDragEnd 里先 arrayMove 重排，DOM 立即更新，
   * 再异步写库。快照按 scope 保存 id 顺序，服务端 refreshRemote 换掉 ledger 后清空。
   */
  const [orderOverrides, setOrderOverrides] = useState<Record<string, string[]>>({})

  useEffect(() => {
    setOrderOverrides({})
  }, [ledger])

  const buildGroups = (type: 'asset' | 'liability'): AccountGroup[] =>
    withOrder(accountGroupsForType(ledger, type), orderOverrides[orderScopeKey({ kind: 'group', type })]).map(
      (group) => ({
        ...group,
        rows: withOrder(group.rows, orderOverrides[orderScopeKey({ kind: 'account', groupId: group.id })]),
      }),
    )
  const assetGroups = useMemo(() => buildGroups('asset'), [ledger, orderOverrides])
  const liabilityGroups = useMemo(() => buildGroups('liability'), [ledger, orderOverrides])
  const rowsByType = useMemo(() => {
    const build = (type: CategoryTab): CategoryRow[] => {
      const sortTree = (rows: CategoryRow[]): CategoryRow[] =>
        rows.map((row) => ({
          ...row,
          children: sortTree(
            withOrder(row.children, orderOverrides[orderScopeKey({ kind: 'category', type, parentId: row.id })]),
          ),
        }))
      return sortTree(
        withOrder(categoryRows(ledger, type), orderOverrides[orderScopeKey({ kind: 'category', type })]),
      )
    }
    return { income: build('income'), expense: build('expense') }
  }, [ledger, orderOverrides])

  /** 当前展示的某个同级列表 id 顺序，作为该 scope 的排序基准。 */
  const idsForScope = (scope: ConfigOrderScope): string[] => {
    if (scope.kind === 'category') {
      const rows = rowsByType[scope.type]
      const siblings = scope.parentId
        ? (rows.find((row) => row.id === scope.parentId)?.children ?? [])
        : rows
      return siblings.map((row) => row.id)
    }
    if (scope.kind === 'group') {
      return (scope.type === 'asset' ? assetGroups : liabilityGroups).map((group) => group.id)
    }
    return (
      [...assetGroups, ...liabilityGroups].find((group) => group.id === scope.groupId)?.rows.map(
        (account) => account.id,
      ) ?? []
    )
  }

  /** 官方 handleDragEnd 的 setItems(arrayMove(...)) 对应物：立即更新本地排序。 */
  const reorderLocally = (scope: ConfigOrderScope, activeId: string, overId: string) => {
    const key = orderScopeKey(scope)
    setOrderOverrides((current) => {
      const ids = current[key] ?? idsForScope(scope)
      const from = ids.indexOf(activeId)
      const to = ids.indexOf(overId)
      if (from < 0 || to < 0 || from === to) return current
      return { ...current, [key]: arrayMove(ids, from, to) }
    })
  }

  const clearOrder = (scope: ConfigOrderScope) =>
    setOrderOverrides((current) => {
      const key = orderScopeKey(scope)
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })

  const toggleExpanded = (key: string) => setExpanded((current) => toggleExpandedKey(current, key))

  const setGroupsExpanded = (keys: readonly string[], expanded: boolean) =>
    setExpanded((current) => setExpandedKeys(current, keys, expanded))

  const resetTransient = useCallback(() => {
    setMenuOpen(null)
    setConfirming(null)
    setEditor(null)
    setMover(null)
    setDeleteTransfer(null)
  }, [])

  const notifyUndoable = (message: string, run: () => void) =>
    notify(message, { action: { label: '撤销', run } })

  const runUndo = async (token: string) => {
    const result = await undo(token)
    if (!result.ok) notify(result.error ?? '撤销失败')
  }

  const saveEditor = async (value: EditorSaveValue) => {
    if (!editor || editorSaving) return

    setEditorError(null)
    setEditorSaving(true)
    const result =
      editor.kind === 'accountGroup'
        ? editor.mode === 'edit' && editor.groupId
          ? await updateAccountGroup(editor.groupId, {
              name: value.name,
              iconKey: value.iconKey,
            })
          : await createAccountGroup({
              name: value.name,
              type: editor.type,
              iconKey: value.iconKey,
            })
        : editor.kind === 'account'
          ? editor.mode === 'edit' && editor.accountId
            ? await updateAccount(editor.accountId, {
                name: value.name,
                kind: value.kind,
                categoryId: value.categoryId,
                balance: value.balance,
                initialBalance: value.initialBalance,
                initialBalanceDate: value.initialBalanceDate,
                iconKey: value.iconKey,
              })
            : await createAccount({
                name: value.name,
                kind: value.kind,
                categoryId: value.categoryId,
                balance: value.balance,
                initialBalance: value.initialBalance,
                initialBalanceDate: value.initialBalanceDate,
                iconKey: value.iconKey,
              })
          : editor.mode === 'edit' && editor.categoryId
            ? await updateCategory(editor.categoryId, {
                name: value.name,
                iconKey: value.iconKey,
              })
            : await createCategory({
                name: value.name,
                type: editor.type,
                parentId: editor.parentId ?? null,
                iconKey: value.iconKey,
              })
    setEditorSaving(false)
    if (!result.ok) {
      // 失败保留表单与原输入，错误可见，可直接重试。
      setEditorError(result.error ?? '保存失败，请重试')
      return
    }
    onAfterWrite?.()
    if (editor.kind === 'accountGroup') {
      notify(editor.mode === 'edit' ? '分组已更新' : '分组已新增')
      setEditor(null)
      return
    }
    notify(
      editor.kind === 'account'
        ? editor.mode === 'edit'
          ? '账户已更新'
          : '账户已新增'
        : editor.mode === 'edit'
          ? '分类已更新'
          : '分类已新增',
    )
    setEditor(null)
  }

  const deleteAccount = async (account: AccountRow) => {
    const result = await deleteAccountRemote(account.id)
    if (!result.ok) {
      notify(result.error ?? '删除失败，请重试')
      return
    }
    onAfterWrite?.()
    if (result.undoToken) {
      notifyUndoable('账户已删除', () => void runUndo(result.undoToken!))
    } else {
      notify('账户已删除')
    }
  }

  /** 删除分组：有账户引用时后端拒绝，前端显式说明原因，绝不静默清空引用。 */
  const deleteGroup = async (group: AccountGroup) => {
    if (group.ungrouped) {
      notify('「未分组」是默认归类占位，不能删除；把账户移入任一正式分组即可')
      return
    }
    if (accountGroupCount(group) > 0) {
      const names = group.rows
        .slice(0, 3)
        .map((account) => accountDisplayName(account, ledger.accounts))
        .join('、')
      notify(
        `「${group.name}」下还有 ${accountGroupCount(group)} 个账户（${names}${
          accountGroupCount(group) > 3 ? '…' : ''
        }），后端拒绝删除；后端暂无停用字段，请先把账户移到其他分组`,
      )
      return
    }
    const result = await deleteAccountGroupRemote(group.id)
    if (!result.ok) {
      notify(result.error ?? '删除分组失败，请重试')
      return
    }
    onAfterWrite?.()
    notify(`分组「${group.name}」已删除`)
    setEditor(null)
  }

  const deleteEditorTarget = async () => {
    if (!editor) return
    if (editor.kind === 'accountGroup' && editor.groupId) {
      const groups = editor.type === 'asset' ? assetGroups : liabilityGroups
      const target = groups.find((group) => group.id === editor.groupId)
      if (target) await deleteGroup(target)
      return
    }
    if (editor.kind === 'account' && editor.accountId) {
      const account = ledger.accounts.find((item) => item.id === editor.accountId)
      if (!account) return
      await deleteAccount({
        id: account.id,
        name: account.name,
        balance: account.balance,
        initialBalance: account.initialBalance,
        initialBalanceDate: account.initialBalanceDate,
        txCount: accountTxCount(ledger, account.id),
      })
      setEditor(null)
    }
  }

  /**
   * 拖拽落位：与 dnd-kit 官方示例一致，先本地 arrayMove 更新顺序，
   * 再按绝对位置写库；写库失败撤掉本地快照，ledger 未变即回到原顺序。
   */
  const moveCategoryTo = (
    scope: ConfigOrderScope,
    id: string,
    overId: string,
    targetIndex: number,
  ) => {
    reorderLocally(scope, id, overId)
    void (async () => {
      const result = await reorderCategoryTo(id, targetIndex)
      if (!result.ok) {
        clearOrder(scope)
        notify(result.error ?? '排序失败，请重试')
        return
      }
      onAfterWrite?.()
    })()
  }

  const moveAccountGroupTo = (
    scope: ConfigOrderScope,
    id: string,
    overId: string,
    targetIndex: number,
  ) => {
    reorderLocally(scope, id, overId)
    void (async () => {
      const result = await reorderAccountGroupTo(id, targetIndex)
      if (!result.ok) {
        clearOrder(scope)
        notify(result.error ?? '排序失败，请重试')
        return
      }
      onAfterWrite?.()
    })()
  }

  const moveAccountTo = (
    scope: ConfigOrderScope,
    id: string,
    overId: string,
    targetIndex: number,
  ) => {
    reorderLocally(scope, id, overId)
    void (async () => {
      const result = await reorderAccountTo(id, targetIndex)
      if (!result.ok) {
        clearOrder(scope)
        notify(result.error ?? '排序失败，请重试')
        return
      }
      onAfterWrite?.()
    })()
  }

  const openTransfer = async (row: CategoryRow, type: TxType) => {
    let txCount = row.txCount
    try {
      const stats = await transactionCategoryApi.getStats(row.id).then(unwrapApiData)
      txCount = stats.transactionCount
    } catch (error) {
      notify(getApiErrorMessage(error))
      return
    }
    setDeleteTransfer({ row: { ...row, txCount }, type })
  }

  const deleteCategory = async (row: CategoryRow, type: TxType) => {
    // 有交易引用先转移：直接删会被后端拒绝，跳到转移流程。
    if (row.txCount > 0) {
      await openTransfer(row, type)
      return
    }
    const result = await deleteCategoryRemote(row.id)
    if (result.ok) {
      onAfterWrite?.()
      if (result.undoToken) {
        notifyUndoable(`分类「${row.name}」已删除`, () => void runUndo(result.undoToken!))
      } else {
        notify('分类已删除')
      }
      return
    }
    if ((result.error ?? '').includes('存在交易记录')) {
      await openTransfer(row, type)
      return
    }
    notify(result.error ?? '删除失败，请重试')
  }

  const transferAndDelete = async (targetId: string) => {
    if (!deleteTransfer || deleteSaving) return
    const { row } = deleteTransfer
    const targetName =
      ledger.categories.find((item) => item.id === targetId)?.name ?? '目标分类'
    setDeleteError(null)
    setDeleteSaving(true)
    const result = await deleteCategoryRemote(row.id, targetId)
    setDeleteSaving(false)
    if (!result.ok) {
      setDeleteError(result.error ?? '转移失败，请重试')
      return
    }
    setDeleteTransfer(null)
    onAfterWrite?.()
    const message = `已转移 ${row.txCount} 笔到「${targetName}」并删除「${row.name}」`
    if (result.undoToken) {
      notifyUndoable(message, () => void runUndo(result.undoToken!))
    } else {
      notify(message)
    }
  }

  const move = async (target: string) => {
    if (!mover || moverSaving) return
    setMoverError(null)
    if (mover.kind === 'activity') {
      setMoverSaving(true)
      const result = await setCategoryCashFlow(
        mover.id,
        target === 'unassigned' ? null : (target as CashFlowActivityKey),
      )
      setMoverSaving(false)
      if (!result.ok) {
        setMoverError(result.error ?? '保存活动归属失败，请重试')
        return
      }
      onAfterWrite?.()
      notify('活动归属已更新')
      setMover(null)
      return
    }
    if (mover.kind === 'asset-mark') {
      setMoverSaving(true)
      const result = await setAccountCategoryMark(mover.id, target as AssetMarkId)
      setMoverSaving(false)
      if (!result.ok) {
        setMoverError(result.error ?? '保存资产标记失败，请重试')
        return
      }
      onAfterWrite?.()
      notify('资产标记已更新')
      setMover(null)
      return
    }

    setMoverSaving(true)
    const result =
      mover.kind === 'account'
        ? await (async () => {
            const account = ledger.accounts.find((item) => item.id === mover.id)
            if (!account) return { ok: false, error: '账户不存在' }
            return updateAccount(account.id, {
              name: account.name,
              kind: account.kind,
              // 空 id = 未分组；后端允许更新账户的分类为 null。
              categoryId: target === '' ? null : target,
              balance: account.balance,
            })
          })()
        : await moveCategory(mover.id, target === 'root' ? null : target)
    setMoverSaving(false)
    if (!result.ok) {
      setMoverError(result.error ?? '移动失败，请重试')
      return
    }
    onAfterWrite?.()
    notify(mover.kind === 'account' ? '账户已移动到新分组' : '分类已移动')
    setMover(null)
  }

  return {
    ledger,
    accountTab,
    setAccountTab,
    showEmptyGroups,
    setShowEmptyGroups,
    categoryTab,
    setCategoryTab,
    cashTab,
    setCashTab,
    expandedKeys,
    toggleExpanded,
    setGroupsExpanded,
    menuOpen,
    setMenuOpen,
    confirming,
    setConfirming,
    editor,
    setEditor,
    mover,
    setMover,
    deleteTransfer,
    setDeleteTransfer,
    editorError,
    editorSaving,
    moverError,
    moverSaving,
    deleteError,
    deleteSaving,
    assetGroups,
    liabilityGroups,
    rowsByType,
    saveEditor,
    deleteEditorTarget,
    moveCategoryTo,
    moveAccountGroupTo,
    moveAccountTo,
    deleteCategory,
    deleteAccount,
    deleteGroup,
    transferAndDelete,
    move,
    resetTransient,
  }
}

export type LedgerConfigController = ReturnType<typeof useLedgerConfigController>
