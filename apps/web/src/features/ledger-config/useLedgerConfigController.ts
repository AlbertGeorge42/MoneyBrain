/**
 * 账户 / 收支分类管理的共享编排。
 *
 * 只承载“管理账本数据”的临时 UI 状态与写操作，不放进全局 Context：
 * 设置页和报表页各调用一次，互不影响抽屉状态。数据源仍是 LedgerProvider。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLedger } from '@/features/overview/ledgerStore'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import type { ToastOptions } from '@/features/shared/toastContext'
import { transactionCategoryApi } from '@/services/api'
import { getApiErrorMessage } from '@/services/apiError'
import { unwrapApiData } from '@/services/apiResult'
import type { TxType } from '@/features/overview/model'
import type { Editor, EditorSaveValue } from '@/features/settings/EditorSheet'
import type { Mover } from '@/features/settings/MoverSheet'
import {
  accountGroupCount,
  accountGroupsForType,
  accountTxCount,
  categoryRows,
  type AccountGroup,
  type AccountRow,
  type ActivityGroupId,
  type CategoryRow,
  type CategoryTab,
} from '@/features/settings/settingsModel'

export interface LedgerConfigControllerOptions {
  /** 宿主页面的轻提示；报表页可在此绑定 reports 变体。 */
  notify: (message: string, options?: ToastOptions) => void
  /** 投资目标占比仍属设置页本地状态，由宿主处理。 */
  onSaveInvest: (id: string, value: EditorSaveValue) => void
  /** 现金流活动归属仍是设置页本地状态，由宿主处理。 */
  onMoveActivity: (id: string, group: ActivityGroupId) => void
}

export function useLedgerConfigController({
  notify,
  onSaveInvest,
  onMoveActivity,
}: LedgerConfigControllerOptions) {
  const {
    ledger,
    dataMode,
    createAccount,
    updateAccount,
    deleteAccount: deleteAccountRemote,
    reorderAccount,
    createAccountGroup,
    updateAccountGroup,
    deleteAccountGroup: deleteAccountGroupRemote,
    reorderAccountGroup,
    createCategory,
    updateCategory,
    moveCategory,
    deleteCategory: deleteCategoryRemote,
    reorderCategory,
    undo,
  } = useLedger()
  const apiMode = dataMode === 'api'

  const [accountTab, setAccountTab] = useState<'asset' | 'liability'>('asset')
  /** 真实库里有大量导入残留的空分组；默认只看有账户的分组，可一键显示。 */
  const [showEmptyGroups, setShowEmptyGroups] = useState(false)
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('expense')
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(() => new Set())
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

  const assetGroups = useMemo(() => accountGroupsForType(ledger, 'asset'), [ledger])
  const liabilityGroups = useMemo(() => accountGroupsForType(ledger, 'liability'), [ledger])
  const rowsByType = useMemo(
    () => ({
      income: categoryRows(ledger, 'income'),
      expense: categoryRows(ledger, 'expense'),
      transfer: categoryRows(ledger, 'transfer'),
    }),
    [ledger],
  )

  const toggleCollapsed = (key: string) => {
    setCollapsedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const setGroupsCollapsed = (keys: readonly string[], collapse: boolean) => {
    setCollapsedKeys((current) => {
      const next = new Set(current)
      for (const key of keys) {
        if (collapse) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

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
    if (editor.kind === 'invest') {
      onSaveInvest(editor.id, value)
      setEditor(null)
      return
    }

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
              })
            : await createAccount({
                name: value.name,
                kind: value.kind,
                categoryId: value.categoryId,
                balance: value.balance,
                initialBalance: value.initialBalance,
                initialBalanceDate: value.initialBalanceDate,
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
    if (!apiMode && account.txCount > 0) return
    const result = await deleteAccountRemote(account.id)
    if (!result.ok) {
      notify(result.error ?? '删除失败，请重试')
      return
    }
    if (result.undoToken) {
      notifyUndoable('账户已删除', () => void runUndo(result.undoToken!))
    } else {
      notify('账户已删除')
    }
  }

  const moveAccountOrder = async (id: string, direction: 'up' | 'down') => {
    const result = await reorderAccount(id, direction)
    if (!result.ok) notify(result.error ?? '排序失败，请重试')
  }

  /** 删除分组：有账户引用时后端拒绝，前端显式说明原因，绝不静默清空引用。 */
  const deleteGroup = async (group: AccountGroup) => {
    if (group.ungrouped) {
      notify('「未分组」是默认归类占位，不能删除；把账户移入任一正式分组即可')
      return
    }
    if (group.seeded) {
      notify('演示账本的账户性质分组只读，请在真实账本中管理分组')
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

  const moveEditorTarget = async (direction: 'up' | 'down') => {
    if (!editor) return
    if (editor.kind === 'accountGroup' && editor.groupId) {
      const result = await reorderAccountGroup(editor.groupId, direction)
      if (!result.ok) notify(result.error ?? '排序失败，请重试')
      else notify('分组排序已更新')
      return
    }
    if (editor.kind === 'account' && editor.accountId) {
      await moveAccountOrder(editor.accountId, direction)
    }
  }

  const moveCategoryOrder = async (id: string, direction: 'up' | 'down') => {
    const result = await reorderCategory(id, direction)
    if (!result.ok) notify(result.error ?? '排序失败，请重试')
  }

  const openTransfer = async (row: CategoryRow, type: TxType) => {
    let txCount = row.txCount
    if (apiMode) {
      try {
        const realId = ledger.ids?.categoryReal?.[row.id] ?? row.id
        const stats = await transactionCategoryApi.getStats(realId).then(unwrapApiData)
        txCount = stats.transactionCount
      } catch (error) {
        notify(getApiErrorMessage(error))
        return
      }
    }
    setDeleteTransfer({ row: { ...row, txCount }, type })
  }

  const deleteCategory = async (row: CategoryRow, type: TxType) => {
    // 有交易引用先转移：种子模式按本地计数，API 模式先尝试删除、被拒后再查真实计数。
    if (row.txCount > 0) {
      await openTransfer(row, type)
      return
    }
    const result = await deleteCategoryRemote(row.id)
    if (result.ok) {
      if (result.undoToken) {
        notifyUndoable(`分类「${row.name}」已删除`, () => void runUndo(result.undoToken!))
      } else {
        notify('分类已删除')
      }
      return
    }
    if (apiMode && (result.error ?? '').includes('存在交易记录')) {
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
      onMoveActivity(mover.id, target as ActivityGroupId)
      notify('活动归属已更新')
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
    notify(mover.kind === 'account' ? '账户已移动到新分组' : '分类已移动')
    setMover(null)
  }

  return {
    ledger,
    apiMode,
    accountTab,
    setAccountTab,
    showEmptyGroups,
    setShowEmptyGroups,
    categoryTab,
    setCategoryTab,
    collapsed: collapsedKeys,
    toggleCollapsed,
    setGroupsCollapsed,
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
    moveEditorTarget,
    moveCategoryOrder,
    deleteCategory,
    transferAndDelete,
    move,
    resetTransient,
  }
}

export type LedgerConfigController = ReturnType<typeof useLedgerConfigController>
