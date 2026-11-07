/**
 * 设置页（HF 批次 4）
 *
 * 结构以 concept-design「设置信息架构」为准：
 * - PC：左导航 + 右内容，同一时间只显示一个分区；
 * - 移动：7 个入口的列表 → 全屏二级页（页头 ‹ 返回）；
 * - 配置行统一模板：⠿ 占位 + 图标 + 名称（摘要）+ 行尾 ⋯ 菜单；
 * - 「每项皆可调」：编辑 / 移动到… / 删除都真的改账本或设置。
 */
import { useEffect, useMemo, useState } from 'react'
import { useComputedColorScheme, useMantineColorScheme } from '@mantine/core'
import { useToast } from '@/features/shared/toastContext'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import { HfSheet } from '@/features/shared/HfSheet'
import { HfTabs } from '@/features/shared/HfTabs'
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Database,
  Download,
  FolderInput,
  GripVertical,
  HardDriveDownload,
  Landmark,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Sun,
  Tag,
  Trash2,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { ThemeMode } from '@/features/shared/types'
import { fromMajor, minor } from '@domain/index'
import { formatCurrency } from '@/utils/format'
import { downloadBlob, todayFilename } from '@/utils/download'
import { accountApi, dataApi, transactionCategoryApi } from '@/services/api'
import type {
  AutoBackupConfig,
  ImportBackupResult,
  ImportBatch,
  ImportFileSummary,
  ImportPreview,
} from '@/services/api'
import { getApiErrorMessage } from '@/services/apiError'
import { unwrapApiData } from '@/services/apiResult'
import { useLedger } from '@/features/overview/ledgerStore'
import { todayLocal } from '@/features/overview/apiLedger'
import type { AccountKind, TxType } from '@/features/overview/model'
import { RecycleBinCountProbe, RecycleBinPanel } from './RecycleBinSection'
import { ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import type { DataState, DeviceMode } from '@/features/shared/types'
import {
  readDisplaySettings,
  SORT_OPTIONS,
  writeDisplaySettings,
  type DisplaySettings,
  type SortMode,
} from '@/features/transactions/displaySettings'
import {
  ACTIVITY_GROUPS,
  ASSET_MARK_GROUPS,
  CATEGORY_TABS,
  CONFIG_SECTIONS,
  GENERAL_SECTIONS,
  INVESTMENT_TYPES,
  accountGroupDisplayName,
  accountGroupsForType,
  accountTxCount,
  categoryRows,
  categorySiblings,
  defaultActivity,
  sectionMeta,
  type AccountGroup,
  type AccountRow,
  type ActivityGroupId,
  type CategoryRow,
  type CategoryTab,
  type InvestmentTypeRow,
  type SectionId,
} from './settingsModel'
import { ReconcileButton } from './ReconcileSheet'
import { CategoryDeleteSheet } from './CategoryDeleteSheet'
import { EditorSheet, type Editor, type EditorSaveValue } from './EditorSheet'
import { MoverSheet, type Mover } from './MoverSheet'
import { RowMenu } from './RowMenu'
import { ReportCardList, ReportTable, type CardRow, type ReportRow } from '@/features/reports/ReportTable'
import '@/features/reports/reports.css'
import './settings.css'

interface SettingsPageProps {
  device: DeviceMode
  dataState: DataState
  onRetry: () => void
  onImport: () => void
}

const ACCOUNT_ICONS: Record<AccountKind, LucideIcon> = {
  deposit: Landmark,
  cash: Wallet,
  investment: TrendingUp,
  credit: CreditCard,
}

const CASHFLOW_TABS: readonly { id: 'asset' | 'income' | 'expense' | 'transfer'; label: string }[] = [
  { id: 'asset', label: '资产分类' },
  { id: 'income', label: '收入分类' },
  { id: 'expense', label: '支出分类' },
  { id: 'transfer', label: '转账分类' },
]

/** 清空确认需要用户逐字输入的文字 */
const CLEAR_WORD = '清空账本'

const THEME_OPTIONS: readonly { value: ThemeMode; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]

function countByType(categories: readonly { type: TxType }[], type: TxType): number {
  return categories.filter((category) => category.type === type).length
}

/** 账户快照：余额按 balance-at 当日口径取，避免用总数或流水倒推。 */
interface AccountSnapshotRow {
  id: string
  name: string
  isLiability: boolean
  initialBalance: number
  initialBalanceDate: string | null
  balance: number
}

interface NetSnapshot {
  assets: number
  liabilities: number
  net: number
}

function netSnapshotOf(rows: readonly AccountSnapshotRow[]): NetSnapshot {
  let assets = 0
  let liabilities = 0
  for (const row of rows) {
    if (row.isLiability) liabilities += row.balance
    else assets += row.balance
  }
  // 负债余额按「绝对欠款」口径展示，净资产 = 资产 − 负债（与报表页一致）。
  const debt = Math.abs(liabilities)
  return { assets, liabilities: debt, net: assets - debt }
}

async function fetchAccountSnapshots(): Promise<AccountSnapshotRow[]> {
  const accounts = await accountApi.getAll().then(unwrapApiData)
  return Promise.all(
    accounts.map(async (account) => {
      const result = await accountApi.getBalanceAt(account.id, todayLocal()).then(unwrapApiData)
      return {
        id: account.id,
        name: account.name,
        isLiability: account.type === 'liability',
        initialBalance: Number(account.initialBalance),
        initialBalanceDate: account.initialBalanceDate,
        balance: result.balance,
      }
    }),
  )
}

function useMenuDismiss(openId: string | null, close: () => void) {
  useEffect(() => {
    if (!openId) return
    const handle = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.mb-set-more-wrap')) close()
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [openId, close])
}

export function SettingsPage({ device, dataState, onRetry, onImport }: SettingsPageProps) {
  const {
    ledger,
    dataMode,
    replaceLedger,
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
  const [trashCount, setTrashCount] = useState(0)
  const [active, setActive] = useState<SectionId>('accounts')
  const [openSection, setOpenSection] = useState<SectionId | null>(null)
  const [accountTab, setAccountTab] = useState<'asset' | 'liability'>('asset')
  /** 真实库里有大量导入残留的空分组；默认只看有账户的分组，可一键显示。 */
  const [showEmptyGroups, setShowEmptyGroups] = useState(false)
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('expense')
  const [cashTab, setCashTab] = useState<'asset' | 'income' | 'expense' | 'transfer'>('asset')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [mover, setMover] = useState<Mover | null>(null)
  const [deleteTransfer, setDeleteTransfer] = useState<{ row: CategoryRow; type: TxType } | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [editorSaving, setEditorSaving] = useState(false)
  const [moverError, setMoverError] = useState<string | null>(null)
  const [moverSaving, setMoverSaving] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const { notify: pushToast } = useToast()
  const [display, setDisplay] = useState<DisplaySettings>(readDisplaySettings)
  const [activity, setActivity] = useState<Record<string, ActivityGroupId>>({})
  const [investRows, setInvestRows] = useState<readonly InvestmentTypeRow[]>(INVESTMENT_TYPES)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  /* ===== 外观主题：直接读写 Mantine 的 colorScheme（light / dark / auto） ===== */
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const currentTheme = useComputedColorScheme('light')
  const themeMode: ThemeMode = colorScheme === 'auto' ? 'system' : colorScheme

  /* ===== 自动备份：真实读写 GET/PUT /data/auto-backup ===== */
  const [backupConfig, setBackupConfig] = useState<AutoBackupConfig | null>(null)
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [backupEnabled, setBackupEnabled] = useState<boolean | null>(null)
  const [backupDirectory, setBackupDirectory] = useState<string | null>(null)
  const [backupSaving, setBackupSaving] = useState(false)
  const [backupReloadKey, setBackupReloadKey] = useState(0)

  /* ===== 数据：导入 / 导出 / 回滚 / 清空 ===== */
  type DataBusy = null | 'export' | 'preview' | 'import' | 'clear' | `rollback:${string}`
  const [dataBusy, setDataBusy] = useState<DataBusy>(null)
  const [backupReady, setBackupReady] = useState<{ filename: string; at: string } | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [lastImport, setLastImport] = useState<ImportBackupResult | null>(null)
  /** 导入后创建的新账户：补录期初余额（可跳过，跳过即标注余额由流水推导）。 */
  const [openingStep, setOpeningStep] = useState<{
    accounts: AccountSnapshotRow[]
    before: NetSnapshot
  } | null>(null)
  const [openingValues, setOpeningValues] = useState<
    Record<string, { amount: string; date: string }>
  >({})
  const [openingResult, setOpeningResult] = useState<{
    before: NetSnapshot
    after: NetSnapshot
  } | null>(null)
  const [openingError, setOpeningError] = useState<string | null>(null)
  const [openingSaving, setOpeningSaving] = useState(false)
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [batchError, setBatchError] = useState<string | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearWord, setClearWord] = useState('')
  const [clearError, setClearError] = useState<string | null>(null)

  const refreshImportBatches = async () => {
    try {
      const response = await dataApi.listImportBatches()
      setBatches(unwrapApiData(response))
      setBatchError(null)
    } catch (error) {
      setBatchError(getApiErrorMessage(error, '读取导入记录失败，请重试'))
    }
  }

  useEffect(() => {
    if (!apiMode) return
    if (active !== 'data' && openSection !== 'data') return
    let cancelled = false
    void (async () => {
      try {
        const response = await dataApi.listImportBatches()
        if (!cancelled) {
          setBatches(unwrapApiData(response))
          setBatchError(null)
        }
      } catch (error) {
        if (!cancelled) setBatchError(getApiErrorMessage(error, '读取导入记录失败，请重试'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiMode, active, openSection, lastImport])

  useEffect(() => {
    if (!apiMode) return
    if (active !== 'backup' && openSection !== 'backup') return
    let cancelled = false
    setBackupLoading(true)
    void (async () => {
      try {
        const response = await dataApi.getAutoBackup()
        if (cancelled) return
        setBackupConfig(unwrapApiData(response))
        setBackupError(null)
      } catch (error) {
        if (!cancelled) setBackupError(getApiErrorMessage(error, '读取自动备份配置失败，请重试'))
      } finally {
        if (!cancelled) setBackupLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiMode, active, openSection, backupReloadKey])

  const notify = (message: string) => pushToast(message, { duration: 2600 })

  const saveAutoBackup = async () => {
    if (!backupConfig) return
    const enabled = backupEnabled ?? backupConfig.enabled
    const directory = (backupDirectory ?? backupConfig.directory).trim()
    setBackupSaving(true)
    setBackupError(null)
    try {
      await dataApi.updateAutoBackup({ enabled, directory })
      // PUT 只回写配置本体；再读一次拿回 nextWindowAt / backupCount 等派生状态。
      const response = await dataApi.getAutoBackup()
      setBackupConfig(unwrapApiData(response))
      setBackupEnabled(null)
      setBackupDirectory(null)
      notify('自动备份设置已保存')
    } catch (error) {
      setBackupError(getApiErrorMessage(error, '保存自动备份设置失败'))
    } finally {
      setBackupSaving(false)
    }
  }
  // 危险操作（转移后删除）与批量删除一致：6 秒内可撤销。
  const notifyUndoable = (message: string, run: () => void) =>
    pushToast(message, { duration: 6000, action: { label: '撤销', run } })

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
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(null), 3000)
    return () => window.clearTimeout(timer)
  }, [armed])

  useEffect(() => {
    setMenuOpen(null)
    setConfirming(null)
    setArmed(null)
    setEditor(null)
    setMover(null)
    setDeleteTransfer(null)
  }, [active, openSection])

  useMenuDismiss(menuOpen, () => setMenuOpen(null))

  useEffect(() => {
    writeDisplaySettings(display)
  }, [display])

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

  const toggleCollapsed = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /* ===== 操作 ===== */

  const runUndo = async (token: string) => {
    const result = await undo(token)
    if (!result.ok) notify(result.error ?? '撤销失败')
  }

  const saveEditor = async (value: EditorSaveValue) => {
    if (!editor || editorSaving) return
    if (editor.kind === 'invest') {
      setInvestRows((rows) =>
        rows.map((row) => (row.id === editor.id ? { ...row, target: value.target } : row)),
      )
      notify('目标占比已更新')
      setEditor(null)
      return
    }

    setEditorError(null)
    setEditorSaving(true)
    const result =
      editor.kind === 'accountGroup'
        ? editor.mode === 'edit' && editor.groupId
          ? await updateAccountGroup(editor.groupId, value.name)
          : await createAccountGroup({ name: value.name, type: editor.type })
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
            ? await updateCategory(editor.categoryId, value.name)
            : await createCategory({
                name: value.name,
                type: editor.type,
                parentId: editor.parentId ?? null,
              })
    setEditorSaving(false)
    if (!result.ok) {
      // 失败保留表单与原输入，错误可见，可直接重试。
      setEditorError(result.error ?? '保存失败，请重试')
      return
    }
    if (editor.kind === 'accountGroup') {
      notify(editor.mode === 'edit' ? '分组已重命名' : '分组已新增')
      setEditor(null)
      return
    }
    notify(
      editor.kind === 'account'
        ? editor.mode === 'edit'
          ? '账户已更新'
          : '账户已新增'
        : editor.mode === 'edit'
          ? '分类已重命名'
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
    if (group.rows.length > 0) {
      const names = group.rows
        .slice(0, 3)
        .map((account) => accountDisplayName(account, ledger.accounts))
        .join('、')
      notify(
        `「${group.name}」下还有 ${group.rows.length} 个账户（${names}${
          group.rows.length > 3 ? '…' : ''
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
      setActivity((current) => ({ ...current, [mover.id]: target as ActivityGroupId }))
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

  const moveActivity = (categoryId: string, group: ActivityGroupId) => {
    setActivity((current) => ({ ...current, [categoryId]: group }))
    notify('活动归属已更新')
    setMover(null)
  }

  const exportLedger = () => {
    const blob = new Blob([JSON.stringify(ledger, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'moneybrain-ledger.json'
    link.click()
    URL.revokeObjectURL(url)
    notify('已导出当前账本 JSON')
  }

  const clearLedger = () => {
    replaceLedger({ accounts: [], categories: [], budgets: [], transactions: [] })
    notify('账本已清空')
    setArmed(null)
  }

  /** API 模式：后端导出加密容器 `.mbx`，成功后才允许清空。 */
  const exportApiLedger = async () => {
    if (dataBusy) return
    setDataBusy('export')
    setExportError(null)
    try {
      const response = await dataApi.exportFull()
      const disposition = String(response.headers['content-disposition'] ?? '')
      const matched = /filename="?([^";]+)"?/i.exec(disposition)
      const filename = matched?.[1] ?? todayFilename('moneybrain-backup', 'mbx')
      await downloadBlob(response.data, filename)
      setBackupReady({ filename, at: new Date().toISOString() })
      notify(`已导出备份 ${filename}`)
    } catch (error) {
      setExportError(getApiErrorMessage(error, '导出失败，请重试'))
    } finally {
      setDataBusy(null)
    }
  }

  const runImportPreview = async () => {
    if (!importFile) {
      setPreviewError('请选择要导入的备份文件')
      return
    }
    if (dataBusy) return
    setDataBusy('preview')
    setPreviewError(null)
    setPreview(null)
    try {
      const response = await dataApi.previewImport(importFile, { mode: 'merge' })
      setPreview(unwrapApiData(response))
    } catch (error) {
      setPreviewError(getApiErrorMessage(error, '解析失败，请检查文件后重试'))
    } finally {
      setDataBusy(null)
    }
  }

  const confirmImport = async () => {
    if (!importFile || !preview || dataBusy) return
    setDataBusy('import')
    setPreviewError(null)
    try {
      const response = await dataApi.importBackup(importFile, { mode: 'merge' })
      const result = unwrapApiData(response)
      setLastImport(result)
      setImportOpen(false)
      setImportFile(null)
      setPreview(null)
      notify(`这批导入了 ${result.imported.transactions} 笔`)
      onRetry()
      await refreshImportBatches()
      // 新账户的期初不能由流水倒推：导入完成后立刻进入补录步骤（可跳过）。
      const created = result.summary?.unknownAccounts ?? []
      if (created.length > 0) await openOpeningStep(created)
    } catch (error) {
      setPreviewError(getApiErrorMessage(error, '导入失败，数据没有写入，可重试'))
    } finally {
      setDataBusy(null)
    }
  }

  /** 导入收尾：列出本批新建的账户，逐个填期初余额与日期。 */
  const openOpeningStep = async (names: readonly string[]) => {
    setOpeningResult(null)
    setOpeningError(null)
    try {
      const rows = await fetchAccountSnapshots()
      const targets = rows.filter((row) => names.includes(row.name))
      if (targets.length === 0) {
        notify('这批没有新建账户，无需补录期初')
        return
      }
      setOpeningValues(
        Object.fromEntries(
          targets.map((row) => [
            row.id,
            {
              // 未设期初的账户留空：留空 = 跳过，不会把 0 元写成「已设期初」。
              amount: row.initialBalance !== 0 ? String(row.initialBalance / 100) : '',
              date: row.initialBalanceDate ?? todayLocal(),
            },
          ]),
        ),
      )
      setOpeningStep({ accounts: targets, before: netSnapshotOf(rows) })
    } catch (error) {
      setOpeningError(getApiErrorMessage(error, '读取新账户失败，可稍后从「账户期初补录」重试'))
      notify(getApiErrorMessage(error, '读取新账户失败'))
    }
  }

  const saveOpeningStep = async () => {
    if (!openingStep || openingSaving) return
    setOpeningSaving(true)
    setOpeningError(null)
    try {
      for (const account of openingStep.accounts) {
        const value = openingValues[account.id]
        // 留空表示跳过该账户，不写期初日期，页面继续标注「未设期初」。
        if (!value || value.amount.trim() === '') continue
        const amount = Number(value.amount)
        if (!Number.isFinite(amount)) throw new Error(`「${account.name}」的期初余额格式不正确`)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
          throw new Error(`「${account.name}」的期初余额日期格式不正确`)
        }
        await accountApi
          .update(account.id, {
            initialBalance: fromMajor(amount),
            initialBalanceDate: value.date,
          })
          .then(unwrapApiData)
      }
      const rows = await fetchAccountSnapshots()
      setOpeningResult({ before: openingStep.before, after: netSnapshotOf(rows) })
      setOpeningStep({
        accounts: rows.filter((row) => openingStep.accounts.some((item) => item.id === row.id)),
        before: openingStep.before,
      })
      notify('期初余额已保存，资产负债与净资产已按新期初重算')
      onRetry()
    } catch (error) {
      setOpeningError(getApiErrorMessage(error, '保存失败，请检查后重试'))
    } finally {
      setOpeningSaving(false)
    }
  }

  const closeOpeningStep = () => {
    setOpeningStep(null)
    setOpeningResult(null)
    setOpeningValues({})
    setOpeningError(null)
  }

  const skipOpeningStep = () => {
    closeOpeningStep()
    notify('已跳过期初补录：这些账户的余额由流水推导，可能不准')
  }

  const rollbackImport = async (batch: ImportBatch) => {
    if (dataBusy) return
    setDataBusy(`rollback:${batch.id}`)
    setBatchError(null)
    try {
      const response = await dataApi.rollbackImportBatch(batch.id)
      const result = unwrapApiData(response)
      notify(`已撤销 ${result.removedTransactions} 笔`)
      await refreshImportBatches()
      onRetry()
    } catch (error) {
      setBatchError(getApiErrorMessage(error, '撤销失败，请重试'))
    } finally {
      setDataBusy(null)
      setArmed(null)
    }
  }

  const openClearSheet = () => {
    setClearOpen(true)
    setClearWord('')
    setClearError(null)
    setArmed(null)
  }

  const confirmClearLedger = async () => {
    if (dataBusy) return
    if (!backupReady) {
      setClearError('请先导出备份：备份成功后才会继续清空')
      return
    }
    if (clearWord.trim() !== CLEAR_WORD) {
      setClearError(`请输入「${CLEAR_WORD}」以确认`)
      return
    }
    setDataBusy('clear')
    setClearError(null)
    try {
      await dataApi.clearAll()
      replaceLedger({ accounts: [], categories: [], budgets: [], transactions: [] })
      setClearOpen(false)
      setClearWord('')
      setBackupReady(null)
      notify('账本已清空，可用刚导出的备份恢复')
      onRetry()
    } catch (error) {
      setClearError(getApiErrorMessage(error, '清空失败，数据没有变化，可重试'))
    } finally {
      setDataBusy(null)
    }
  }

  /* ===== 行渲染 ===== */

  const renderCategoryRow = (row: CategoryRow, type: TxType, level: number) => {
    const expandedRow = !collapsed.has(`cat-${row.id}`)
    const siblings = categorySiblings(ledger, row.id)
    const index = siblings.findIndex((category) => category.id === row.id)
    return (
      <div key={row.id} className={level > 0 ? 'mb-set-group is-child' : 'mb-set-group'}>
        <div className={level > 0 ? 'mb-set-row is-child' : 'mb-set-row'}>
          {row.childCount > 0 ? (
            <button
              type="button"
              className="mb-set-fold"
              aria-label={expandedRow ? '收起子分类' : '展开子分类'}
              aria-expanded={expandedRow}
              onClick={() => toggleCollapsed(`cat-${row.id}`)}
            >
              {expandedRow ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <span className="mb-set-child-space" aria-hidden="true" />
          )}
          <span className="mb-set-drag" aria-hidden="true">
            <GripVertical size={14} />
          </span>
          <span className="mb-set-icon">
            <Tag size={16} />
          </span>
          <span className="mb-set-name">{row.name}</span>
          <span className="mb-set-meta">
            {row.txCount} 笔{row.childCount > 0 ? ` · ${row.childCount} 个子分类` : ''}
          </span>
          <RowMenu
            id={`cat-${row.id}`}
            openId={menuOpen}
            onOpen={setMenuOpen}
            confirming={confirming}
            onConfirm={setConfirming}
            items={[
              ...(level === 0
                ? [
                    {
                      key: `child-${row.id}`,
                      label: '新增子分类',
                      onSelect: () =>
                        setEditor({ kind: 'category', mode: 'create', type, parentId: row.id }),
                    },
                  ]
                : []),
              {
                key: `edit-${row.id}`,
                label: '编辑',
                onSelect: () =>
                  setEditor({ kind: 'category', mode: 'edit', type, categoryId: row.id }),
              },
              {
                key: `move-${row.id}`,
                label: '移动到…',
                onSelect: () =>
                  setMover({
                    kind: 'category',
                    id: row.id,
                    name: row.name,
                    type,
                    currentParentId:
                      ledger.categories.find((category) => category.id === row.id)?.parentId ?? null,
                  }),
              },
              {
                key: `up-${row.id}`,
                label: '上移',
                disabled: index <= 0,
                onSelect: () => void moveCategoryOrder(row.id, 'up'),
              },
              {
                key: `down-${row.id}`,
                label: '下移',
                disabled: index < 0 || index >= siblings.length - 1,
                onSelect: () => void moveCategoryOrder(row.id, 'down'),
              },
              {
                key: `del-${row.id}`,
                label: '删除',
                danger: true,
                // 有子分类时先处理层级；仅被交易引用时打开转移弹窗，完成转移即删除。
                confirm: row.childCount === 0 && row.txCount === 0,
                disabled: row.childCount > 0,
                hint: row.childCount > 0 ? '有子分类，先处理子分类' : undefined,
                onSelect: () => void deleteCategory(row, type),
              },
            ]}
          />
        </div>
        {expandedRow &&
          row.children.map((child) => renderCategoryRow(child, type, level + 1))}
      </div>
    )
  }

  const activityOf = (categoryId: string): ActivityGroupId => {
    if (activity[categoryId]) return activity[categoryId]
    const category = ledger.categories.find((item) => item.id === categoryId)
    return category ? defaultActivity(category) : 'operating'
  }

  /* ===== 分区内容 ===== */

  const renderAccounts = () => {
    const groups = accountTab === 'asset' ? assetGroups : liabilityGroups
    const emptyCount = groups.filter((group) => group.rows.length === 0).length
    const visibleGroups = showEmptyGroups
      ? groups
      : groups.filter((group) => group.rows.length > 0)
    const allCollapsed =
      visibleGroups.length > 0 && visibleGroups.every((group) => collapsed.has(`grp-${group.id}`))
    const groupLabel = (group: AccountGroup) => accountGroupDisplayName(group, groups)
    const subtotal = (group: AccountGroup) =>
      formatCurrency(minor(group.rows.reduce((sum, account) => sum + account.balance, 0)))
    const accountLabel = (account: AccountRow) => accountDisplayName(account, ledger.accounts)
    const expandedOf = (group: AccountGroup) => !collapsed.has(`grp-${group.id}`)
    const toggleGroup = (group: AccountGroup) => toggleCollapsed(`grp-${group.id}`)
    const canManage = (group: AccountGroup) => !group.ungrouped && !group.seeded
    const openGroup = (group: AccountGroup) => {
      if (!canManage(group)) return
      const source = (ledger.accountCategories ?? []).find((item) => item.id === group.id)
      if (!source) return
      setEditor({ kind: 'accountGroup', mode: 'edit', type: group.type, groupId: group.id })
    }
    const openAccount = (account: AccountRow, group: AccountGroup) => {
      const current = ledger.accounts.find((item) => item.id === account.id)
      setEditor({
        kind: 'account',
        mode: 'edit',
        accountId: account.id,
        preset: current?.kind ?? 'deposit',
        groupId: group.ungrouped ? undefined : group.id,
      })
    }
    const totalBalance = groups.reduce(
      (sum, group) => sum + group.rows.reduce((inner, account) => inner + account.balance, 0),
      0,
    )
    const totalAccounts = groups.reduce((sum, group) => sum + group.rows.length, 0)
    const emptyHint =
      groups.length === 0
        ? '还没有分组'
        : emptyCount > 0 && !showEmptyGroups
          ? `已隐藏 ${emptyCount} 个空分组（点「显示空分组」可管理）`
          : undefined

    return (
      <>
        <div className="mb-set-toolbar">
          <HfTabs
            variant="settings"
            label="账户分组"
            value={accountTab}
            items={[
              { id: 'asset', label: '资产分组' },
              { id: 'liability', label: '负债分组' },
            ]}
            onChange={setAccountTab}
          />
          <div className="mb-set-toolbar-actions">
            <button
              type="button"
              className="mb-set-btn is-ghost is-small"
              disabled={emptyCount === 0}
              onClick={() => setShowEmptyGroups((value) => !value)}
            >
              {showEmptyGroups ? '隐藏空分组' : `显示空分组（${emptyCount}）`}
            </button>
            <button
              type="button"
              className="mb-set-btn is-ghost is-small"
              disabled={visibleGroups.length === 0}
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current)
                  for (const group of visibleGroups) {
                    if (allCollapsed) next.delete(`grp-${group.id}`)
                    else next.add(`grp-${group.id}`)
                  }
                  return next
                })
              }
            >
              {allCollapsed ? '全部展开' : '全部收起'}
            </button>
            <button
              type="button"
              className="mb-set-btn is-primary is-small"
              onClick={() => {
                // 新建的分组还没有账户，先切到「显示空分组」，否则保存后会看不见。
                setShowEmptyGroups(true)
                setEditor({ kind: 'accountGroup', mode: 'create', type: accountTab })
              }}
            >
              <Plus size={15} /> 新建分组
            </button>
            <button
              type="button"
              className="mb-set-btn is-ghost is-small"
              onClick={() =>
                setEditor({
                  kind: 'account',
                  mode: 'create',
                  preset: accountTab === 'liability' ? 'credit' : 'deposit',
                })
              }
            >
              <Plus size={15} /> 新增账户
            </button>
          </div>
        </div>

        <p className="mb-set-hint">
          分组即后端的账户分类（AccountCategory）：用于组织与浏览账户。净资产与资产构成合计不变，但资产构成按分类名分行，分组名会出现在表里。新建分组默认不带「现金等价 / 投资」标识；把带标识的账户移入新分组会改变现金流与投资占比，保存前会提示。默认全部展开，点分组行可改名/排序/删除，点账户行可编辑或移动。
        </p>

        {device === 'desktop' ? (
          <ReportTable
            device={device}
            title={accountTab === 'asset' ? '资产账户分组' : '负债账户分组'}
            desc={`共 ${totalAccounts} 个账户；${allCollapsed ? '当前全部收起' : '默认全部展开'}`}
            ariaLabel="账户分组表"
            variant="c3"
            columns={[
              { label: '分组 / 账户' },
              { label: '余额', align: 'num' },
              { label: '账户数', align: 'num' },
            ]}
            rows={visibleGroups.flatMap((group) => {
              const groupRow: ReportRow = {
                id: `grp-${group.id}`,
                cells: [groupLabel(group), subtotal(group), `${group.rows.length} 个`],
                fold: { expanded: expandedOf(group), onToggle: () => toggleGroup(group) },
                onOpen: canManage(group) ? () => openGroup(group) : undefined,
                hint: group.ungrouped ? '默认归类' : group.seeded ? '演示只读' : undefined,
              }
              const accountRows: ReportRow[] = expandedOf(group)
                ? group.rows.map((account) => ({
                    id: `acc-${account.id}`,
                    level: 1 as const,
                    cells: [
                      accountLabel(account),
                      formatCurrency(minor(account.balance)),
                      group.seeded ? '' : (
                        <ReconcileButton
                          account={{ id: account.id, name: accountLabel(account), balance: account.balance }}
                          device="desktop"
                          onDone={onRetry}
                        />
                      ),
                    ],
                    onOpen: () => openAccount(account, group),
                  }))
                : []
              return [groupRow, ...accountRows]
            })}
            total={['合计', formatCurrency(minor(totalBalance)), `${totalAccounts} 个`]}
            note={emptyHint ? `${emptyHint}，点右上角「新建分组」开始。` : undefined}
          />
        ) : (
          <ReportCardList
            device={device}
            title={accountTab === 'asset' ? '资产账户分组' : '负债账户分组'}
            desc={`共 ${totalAccounts} 个账户；${allCollapsed ? '当前全部收起' : '默认全部展开'}`}
            rows={visibleGroups.flatMap((group) => {
              const groupRow: CardRow = {
                id: `grp-${group.id}`,
                label: groupLabel(group),
                meta: `${group.rows.length} 个账户`,
                hint: group.ungrouped ? '默认归类' : group.seeded ? '演示只读' : undefined,
                amount: subtotal(group),
                fold: { expanded: expandedOf(group), onToggle: () => toggleGroup(group) },
                onOpen: canManage(group) ? () => openGroup(group) : undefined,
              }
              const accountRows: CardRow[] = expandedOf(group)
                ? group.rows.map((account) => ({
                    id: `acc-${account.id}`,
                    level: 1 as const,
                    label: accountLabel(account),
                    meta: `${account.txCount} 笔`,
                    amount: formatCurrency(minor(account.balance)),
                    onOpen: () => openAccount(account, group),
                    action: group.seeded ? undefined : (
                      <ReconcileButton
                        account={{ id: account.id, name: accountLabel(account), balance: account.balance }}
                        device="mobile"
                        onDone={onRetry}
                      />
                    ),
                  }))
                : []
              return [groupRow, ...accountRows]
            })}
            total={{ label: '合计', value: formatCurrency(minor(totalBalance)) }}
            emptyText={emptyHint ?? '还没有分组'}
          />
        )}
      </>
    )
  }

  const renderCategories = () => {
    const rows = rowsByType[categoryTab]
    return (
      <>
        <div className="mb-set-toolbar">
          <HfTabs
            variant="settings"
            label="收支分类"
            value={categoryTab}
            items={CATEGORY_TABS.map((tab) => ({ id: tab.type, label: tab.label }))}
            onChange={setCategoryTab}
          />
          <button
            type="button"
            className="mb-set-add"
            onClick={() => setEditor({ kind: 'category', mode: 'create', type: categoryTab })}
          >
            <Plus size={16} />
            新增一级
          </button>
        </div>
        <div className="mb-set-list">
          {rows.length > 0 ? (
            rows.map((row) => renderCategoryRow(row, categoryTab, 0))
          ) : (
            <div className="mb-set-list-empty">
              <Tag size={22} />
              <p>这个类型下还没有分类</p>
              <button
                type="button"
                className="mb-set-btn is-primary"
                onClick={() => setEditor({ kind: 'category', mode: 'create', type: categoryTab })}
              >
                新增一级分类
              </button>
            </div>
          )}
        </div>
      </>
    )
  }

  const renderCashflow = () => {
    if (cashTab === 'asset') {
      return (
        <>
          <div className="mb-set-toolbar">
            <HfTabs
              variant="settings"
              label="现金流分类"
              value={cashTab}
              items={CASHFLOW_TABS}
              onChange={setCashTab}
            />
          </div>
          <div className="mb-set-list">
            {ASSET_MARK_GROUPS.map((group) => {
              const rows = ledger.accounts.filter((account) => group.kinds.includes(account.kind))
              const groupKey = `cf-asset-${group.id}`
              const empty = rows.length === 0
              // 空组默认折叠，不再渲染「没有账户」占位行，避免像还没加载完。
              const open = !empty && !collapsed.has(groupKey)
              return (
                <div key={group.id} className="mb-set-group">
                  <div className="mb-set-row is-group">
                    <button
                      type="button"
                      className="mb-set-fold"
                      aria-label={empty ? '本组无分类' : open ? '收起分类' : '展开分类'}
                      aria-expanded={open}
                      disabled={empty}
                      onClick={() => toggleCollapsed(groupKey)}
                    >
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <span className="mb-set-drag" aria-hidden="true">
                      <GripVertical size={14} />
                    </span>
                    <span className="mb-set-name">{group.label}</span>
                    <span className="mb-set-meta">({rows.length} 个分类)</span>
                  </div>
                  {open &&
                    rows.map((account) => {
                      const Icon = ACCOUNT_ICONS[account.kind]
                      return (
                        <div key={account.id} className="mb-set-row is-child">
                          <span className="mb-set-child-space" aria-hidden="true" />
                          <span className="mb-set-drag" aria-hidden="true">
                            <GripVertical size={14} />
                          </span>
                          <span className="mb-set-icon">
                            <Icon size={16} />
                          </span>
                          <span className="mb-set-name">{accountDisplayName(account, ledger.accounts)}</span>
                          <span className="mb-set-meta">
                            {formatCurrency(minor(account.balance))}
                          </span>
                          <RowMenu
                            id={`cf-${account.id}`}
                            openId={menuOpen}
                            onOpen={setMenuOpen}
                            confirming={confirming}
                            onConfirm={setConfirming}
                            items={[
                              {
                                key: `cf-move-${account.id}`,
                                label: '移动到…',
                                onSelect: () =>
                                  setMover({
                                    kind: 'account',
                                    id: account.id,
                                    name: account.name,
                                    current: account.categoryId ?? null,
                                    type: account.kind === 'credit' ? 'liability' : 'asset',
                                  }),
                              },
                            ]}
                          />
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </>
      )
    }

    const type = cashTab
    const rows = rowsByType[type]
    const flat = rows.map((row) => ({ row, group: activityOf(row.id) }))
    return (
      <>
        <div className="mb-set-toolbar">
          <HfTabs
            variant="settings"
            label="现金流分类"
            value={cashTab}
            items={CASHFLOW_TABS}
            onChange={setCashTab}
          />
        </div>
        <div className="mb-set-list">
          {ACTIVITY_GROUPS.map((group) => {
            const groupRows = flat.filter((item) => item.group === group.id)
            const groupKey = `cf-${type}-${group.id}`
            const empty = groupRows.length === 0
            // 空组默认折叠，不再渲染「未分配」占位行，避免像还没加载完。
            const open = !empty && !collapsed.has(groupKey)
            return (
              <div key={group.id} className="mb-set-group">
                <div className="mb-set-row is-group">
                  <button
                    type="button"
                    className="mb-set-fold"
                    aria-label={empty ? '本组无分类' : open ? '收起分类' : '展开分类'}
                    aria-expanded={open}
                    disabled={empty}
                    onClick={() => toggleCollapsed(groupKey)}
                  >
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <span className="mb-set-drag" aria-hidden="true">
                    <GripVertical size={14} />
                  </span>
                  <span className="mb-set-name">{group.label}</span>
                  <span className="mb-set-meta">({groupRows.length} 个分类)</span>
                </div>
                {open &&
                  groupRows.map(({ row }) => (
                    <div key={row.id} className="mb-set-row is-child">
                      <span className="mb-set-child-space" aria-hidden="true" />
                      <span className="mb-set-drag" aria-hidden="true">
                        <GripVertical size={14} />
                      </span>
                      <span className="mb-set-icon">
                        <Tag size={16} />
                      </span>
                      <span className="mb-set-name">{row.name}</span>
                      <span className="mb-set-meta">{row.txCount} 笔</span>
                      <RowMenu
                        id={`cf-cat-${row.id}`}
                        openId={menuOpen}
                        onOpen={setMenuOpen}
                        confirming={confirming}
                        onConfirm={setConfirming}
                        items={[
                          {
                            key: `cf-group-${row.id}`,
                            label: '移动到…',
                            onSelect: () =>
                              setMover({
                                kind: 'activity',
                                id: row.id,
                                name: row.name,
                                current: activityOf(row.id),
                              }),
                          },
                        ]}
                      />
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  const renderInvest = () => (
    <>
      <div className="mb-set-list">
        {investRows.map((row) => (
          <div key={row.id} className="mb-set-row">
            <span className="mb-set-drag" aria-hidden="true">
              <GripVertical size={14} />
            </span>
            <span className="mb-set-icon">
              <TrendingUp size={16} />
            </span>
            <span className="mb-set-name">{row.name}</span>
            <span className="mb-set-meta">
              当前 {row.current}% · 目标 {row.target}% · {row.rebalance}
            </span>
            <RowMenu
              id={`invest-${row.id}`}
              openId={menuOpen}
              onOpen={setMenuOpen}
              confirming={confirming}
              onConfirm={setConfirming}
              items={[
                {
                  key: `invest-edit-${row.id}`,
                  label: '编辑',
                  onSelect: () => setEditor({ kind: 'invest', id: row.id }),
                },
                {
                  key: `invest-del-${row.id}`,
                  label: '删除',
                  danger: true,
                  confirm: true,
                  disabled: true,
                  hint: '该类型仍持有资产，不能删除',
                  onSelect: () => undefined,
                },
              ]}
            />
          </div>
        ))}
      </div>
    </>
  )

  const renderAppearance = () => {
    const effectiveLabel =
      themeMode === 'system'
        ? `跟随系统（当前${currentTheme === 'dark' ? '深色' : '浅色'}）`
        : currentTheme === 'dark'
          ? '深色'
          : '浅色'
    return (
      <div className="mb-set-appearance">
        <div className="mb-set-subblock">
          <span className="mb-set-label" id="mb-set-theme-label">
            外观主题
          </span>
          <div
            className="mb-set-sort mb-set-theme-grid"
            role="radiogroup"
            aria-labelledby="mb-set-theme-label"
          >
            {THEME_OPTIONS.map((option) => {
              const active = themeMode === option.value
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={
                    active
                      ? 'mb-set-kind mb-set-theme-option is-active'
                      : 'mb-set-kind mb-set-theme-option'
                  }
                  onClick={() =>
                    setColorScheme(option.value === 'system' ? 'auto' : option.value)
                  }
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>
        <p className="mb-set-theme-status" role="status">
          当前生效：{effectiveLabel}
        </p>
        <p className="mb-set-hint">
          切换后立即作用于整个应用，并记住选择；「跟随系统」会随操作系统外观自动变化。
        </p>
      </div>
    )
  }

  const renderBackup = () => {
    const head = (
      <div className="mb-set-datacard-head">
        <HardDriveDownload size={18} />
        <h3>自动备份</h3>
      </div>
    )

    if (!apiMode) {
      return (
        <section className="mb-set-datacard">
          {head}
          <p>自动备份设置需要连接真实后端；当前为演示数据源，无法读取或保存。</p>
        </section>
      )
    }

    if (!backupConfig) {
      return (
        <section className="mb-set-datacard">
          {head}
          {backupError ? (
            <p className="mb-set-error" role="alert">
              {backupError}
              <button
                type="button"
                className="mb-set-textbtn"
                onClick={() => setBackupReloadKey((key) => key + 1)}
              >
                重试
              </button>
            </p>
          ) : (
            <p>{backupLoading ? '正在读取自动备份配置…' : '尚未读取到自动备份配置。'}</p>
          )}
        </section>
      )
    }

    const enabled = backupEnabled ?? backupConfig.enabled
    const directory = backupDirectory ?? backupConfig.directory
    const formatDateTime = (iso: string) =>
      new Date(iso).toLocaleString('zh-CN', { hour12: false })

    return (
      <div className="mb-set-data">
        <section className="mb-set-datacard">
          {head}
          <div className="mb-set-capability-row">
            <div className="mb-set-capability-copy">
              <span className="mb-set-name">开启自动备份</span>
              <span className="mb-set-meta">
                {enabled ? '已开启 · 距上次成功超过 24 小时时执行' : '未开启'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="开启自动备份"
              className={enabled ? 'mb-set-switch is-on' : 'mb-set-switch'}
              onClick={() => setBackupEnabled(!enabled)}
            >
              <span className="mb-set-switch-thumb" aria-hidden="true" />
            </button>
          </div>
          <label className="mb-set-field">
            <span className="mb-set-label">备份目录（绝对路径）</span>
            <input
              className="mb-set-input"
              value={directory}
              placeholder={backupConfig.defaultDirectory}
              onChange={(event) => setBackupDirectory(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="mb-set-btn is-primary"
            disabled={backupSaving}
            onClick={() => void saveAutoBackup()}
          >
            {backupSaving ? '保存中…' : '保存设置'}
          </button>
          {backupError && (
            <p className="mb-set-error" role="alert">
              {backupError}
            </p>
          )}
          <div className="mb-set-backup-meta">
            {backupConfig.lastRunAt ? (
              <span>上次自动备份：{formatDateTime(backupConfig.lastRunAt)}</span>
            ) : (
              <span>还没有自动备份过。</span>
            )}
            <span>
              {backupConfig.nextWindowAt
                ? `预计下次备份：${formatDateTime(backupConfig.nextWindowAt)} 后的第一个空闲窗口`
                : '开启后将在系统空闲时执行首次备份'}
            </span>
            <span>目录内现有备份 {backupConfig.backupCount} 份。</span>
          </div>
          {backupConfig.lastRunError && (
            <p className="mb-set-error" role="alert">
              上次自动备份失败：{backupConfig.lastRunError}
            </p>
          )}
        </section>

        <section className="mb-set-datacard">
          <div className="mb-set-datacard-head">
            <Database size={18} />
            <h3>频率与保留份数</h3>
          </div>
          <p>以下两项后端接口尚未提供字段，前端只读展示当前固定策略，不会假装保存成功。</p>
          <div className="mb-set-capability-row is-disabled">
            <span className="mb-set-name">备份频率</span>
            <select className="mb-set-input mb-set-capability-control" disabled defaultValue="daily">
              <option value="daily">每天</option>
            </select>
            <span className="mb-set-gap-tag">后端未提供</span>
          </div>
          <div className="mb-set-capability-row is-disabled">
            <span className="mb-set-name">保留份数</span>
            <input
              className="mb-set-input mb-set-capability-control"
              type="number"
              disabled
              defaultValue={7}
            />
            <span className="mb-set-gap-tag">后端未提供</span>
          </div>
          <p>服务端当前固定：距上次成功 ≥ 24 小时的空闲窗口执行，目录内保留最近 7 份。</p>
        </section>
      </div>
    )
  }

  const renderDisplay = () => {
    const columns: { key: 'showNote' | 'showAccount' | 'fixed'; label: string; desc?: string }[] = [
      { key: 'showNote', label: '备注列' },
      { key: 'showAccount', label: '账户列' },
      { key: 'fixed', label: '金额与分类', desc: '必需' },
    ]
    return (
      <>
        <div className="mb-set-list">
          {columns.map((column) => {
            const checked = column.key === 'fixed' ? true : display[column.key]
            return (
              <div key={column.key} className="mb-set-row">
                <span className="mb-set-drag" aria-hidden="true">
                  <GripVertical size={14} />
                </span>
                <span className="mb-set-name">{column.label}</span>
                {column.desc && <span className="mb-set-meta">{column.desc}</span>}
                <label className="mb-set-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={column.key === 'fixed'}
                    onChange={(event) => {
                      if (column.key === 'fixed') return
                      setDisplay((current) => ({ ...current, [column.key]: event.target.checked }))
                    }}
                  />
                  <span>显示</span>
                </label>
              </div>
            )
          })}
        </div>
        <div className="mb-set-subblock">
          <span className="mb-set-label">排序方式</span>
          <div className="mb-set-sort" role="radiogroup" aria-label="排序方式">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={display.sort === option.value}
                className={display.sort === option.value ? 'mb-set-kind is-active' : 'mb-set-kind'}
                onClick={() => setDisplay((current) => ({ ...current, sort: option.value as SortMode }))}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </>
    )
  }

  const renderBatchList = () => {
    if (batchError) {
      return (
        <p className="mb-set-error" role="alert">
          {batchError}
          <button type="button" className="mb-set-textbtn" onClick={() => void refreshImportBatches()}>
            重试
          </button>
        </p>
      )
    }
    if (batches.length === 0) {
      return <p>还没有导入记录。导入成功后会在这里显示可撤销的批次。</p>
    }
    return (
      <ul className="mb-set-batch-list">
        {batches.map((batch) => {
          const armedBatch = armed === `import-${batch.id}`
          const busyBatch = dataBusy === `rollback:${batch.id}`
          return (
            <li className="mb-set-batch" key={batch.id}>
              <span className="mb-set-batch-name">{batch.filename}</span>
              <span className="mb-set-batch-meta">
                {new Date(batch.createdAt).toLocaleString('zh-CN', { hour12: false })} · 这批{' '}
                {batch.transactionCount} 笔
              </span>
              {batch.status === 'active' ? (
                <button
                  type="button"
                  className={armedBatch ? 'mb-set-btn is-danger is-armed' : 'mb-set-btn'}
                  disabled={busyBatch}
                  onClick={() => {
                    if (busyBatch) return
                    if (!armedBatch) {
                      setArmed(`import-${batch.id}`)
                      return
                    }
                    void rollbackImport(batch)
                  }}
                >
                  {busyBatch ? '撤销中…' : armedBatch ? '确认撤销' : '撤销这批'}
                </button>
              ) : (
                <span className="mb-set-batch-done">
                  已撤销 {batch.rolledBack?.transaction ?? 0} 笔
                </span>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  const renderImportIssues = (summary: ImportFileSummary | undefined) => {
    if (!summary) return null
    const skippedRows = summary.skippedRows ?? []
    const autoFixedRows = summary.autoFixedRows ?? 0
    if (skippedRows.length === 0 && autoFixedRows === 0) return null
    return (
      <div className="mb-set-preview-issues" data-testid="import-issues">
        {autoFixedRows > 0 && (
          <p>已自动修正 {autoFixedRows} 行（金额浮点尾差已四舍五入到分）</p>
        )}
        {skippedRows.length > 0 && (
          <>
            <p>跳过 {skippedRows.length} 行（未写入账本）：</p>
            <ul>
              {skippedRows.map((row) => (
                <li key={`${row.rowNumber}-${row.reason}`}>
                  第 {row.rowNumber} 行：{row.reason}
                  {Object.keys(row.raw).length > 0 && (
                    <span className="mb-set-preview-issue-raw">
                      原值 {Object.entries(row.raw).map(([key, value]) => `${key}=${value}`).join('；')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }

  const renderImportSummary = (value: ImportPreview) => {
    const summary = value.result.summary
    return (
      <div className="mb-set-preview" data-testid="import-preview">
        {summary ? (
          <>
            <div className="mb-set-preview-row">
              <span>期间跨度</span>
              <b>
                {summary.dateFrom && summary.dateTo
                  ? `${summary.dateFrom} ~ ${summary.dateTo}`
                  : '未识别到日期'}
              </b>
            </div>
            <div className="mb-set-preview-row">
              <span>文件笔数</span>
              <b>{summary.total} 笔</b>
            </div>
            <div className="mb-set-preview-row">
              <span>金额合计</span>
              <b>{formatCurrency(minor(summary.amountTotal))}</b>
            </div>
            <div className="mb-set-preview-row">
              <span>疑似重复</span>
              <b>{summary.duplicates} 笔（将跳过）</b>
            </div>
          </>
        ) : (
          <p>服务端未返回文件摘要，仅显示导入计数。</p>
        )}
        <div className="mb-set-preview-row">
          <span>将导入</span>
          <b>{value.result.imported.transactions} 笔</b>
        </div>
        <div className="mb-set-preview-row">
          <span>将跳过</span>
          <b>{value.result.skipped.transactions} 笔</b>
        </div>
        {summary && (
          <>
            <div className="mb-set-preview-note">
              <span>无法识别的账户（导入时新建）</span>
              <b>{summary.unknownAccounts.length ? summary.unknownAccounts.join('、') : '无'}</b>
            </div>
            <div className="mb-set-preview-note">
              <span>无法识别的分类（导入时新建）</span>
              <b>{summary.unknownCategories.length ? summary.unknownCategories.join('、') : '无'}</b>
            </div>
            {renderImportIssues(summary)}
          </>
        )}
      </div>
    )
  }

  const renderData = () => {
    const unsetAccounts = ledger.accounts.filter((account) => !account.initialBalanceDate)
    // 同名的历史账户（如批量种子钱包）按「名称 + 期初日期」去重，避免同一状态重复刷屏。
    const setAccounts = [
      ...new Map(
        ledger.accounts
          .filter((account) => account.initialBalanceDate)
          .map((account) => [`${account.name}|${account.initialBalanceDate}`, account]),
      ).values(),
    ]
    return (
    <div className="mb-set-data">
      <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <Database size={18} />
          <h3>导出</h3>
        </div>
        {apiMode ? (
          <>
            <button
              type="button"
              className="mb-set-btn"
              disabled={dataBusy === 'export'}
              onClick={() => void exportApiLedger()}
            >
              <Download size={16} />
              {dataBusy === 'export' ? '导出中…' : '导出账本 (.mbx)'}
            </button>
            {backupReady && (
              <p>
                最近备份：{backupReady.filename}（
                {new Date(backupReady.at).toLocaleTimeString('zh-CN', { hour12: false })}）
              </p>
            )}
            {exportError && (
              <p className="mb-set-error" role="alert">
                {exportError}
                <button
                  type="button"
                  className="mb-set-textbtn"
                  onClick={() => void exportApiLedger()}
                >
                  重试
                </button>
              </p>
            )}
          </>
        ) : (
          <button type="button" className="mb-set-btn" onClick={exportLedger}>
            <Download size={16} />
            导出账本
          </button>
        )}
      </section>
      <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <FolderInput size={18} />
          <h3>导入</h3>
        </div>
        {apiMode ? (
          <>
            <button
              type="button"
              className="mb-set-btn"
              onClick={() => {
                setImportOpen(true)
                setPreview(null)
                setPreviewError(null)
              }}
            >
              <FolderInput size={16} />
              打开导入向导
            </button>
            {lastImport && (
              <>
                <p>
                  这批导入了 {lastImport.imported.transactions} 笔；批次 {lastImport.importId?.slice(0, 8)}
                  可在「回滚」撤销。
                </p>
                {renderImportIssues(lastImport.summary)}
              </>
            )}
            <p>导入前会先解析并展示预览，确认后才写入；失败不会留下半截数据。</p>
          </>
        ) : (
          <button type="button" className="mb-set-btn" onClick={onImport}>
            <FolderInput size={16} />
            打开导入向导
          </button>
        )}
      </section>
      <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <RotateCcw size={18} />
          <h3>回滚</h3>
        </div>
        {apiMode ? (
          renderBatchList()
        ) : (
          <>
            <p>还原到最近一次自动存点，回滚前会再存一个还原点。</p>
            <button
              type="button"
              className={armed === 'rollback' ? 'mb-set-btn is-danger is-armed' : 'mb-set-btn'}
              onClick={() => {
                if (armed === 'rollback') {
                  setArmed(null)
                  notify('已恢复到上一存点')
                  return
                }
                setArmed('rollback')
              }}
            >
              {armed === 'rollback' ? '确认恢复' : '回滚到上一存点'}
            </button>
          </>
        )}
      </section>
      <section className="mb-set-datacard is-danger">
        <div className="mb-set-datacard-head">
          <AlertTriangle size={18} />
          <h3>危险区</h3>
        </div>
        {apiMode ? (
          <>
            <p>
              清空前必须导出备份；清空后所有账户、分类、流水、预算与投资快照都会删除，
              回收站与审计记录一并清空。
            </p>
            <button type="button" className="mb-set-btn is-danger" onClick={openClearSheet}>
              清空账本
            </button>
            {!backupReady && <p className="mb-set-warn">尚未导出备份，清空会被拦住。</p>}
          </>
        ) : (
          <>
            <p>清空后所有账户、分类与流水都会删除，仅保留导出文件可恢复。</p>
            <button
              type="button"
              className={armed === 'clear' ? 'mb-set-btn is-danger is-armed' : 'mb-set-btn is-danger'}
              onClick={() => {
                if (armed === 'clear') {
                  clearLedger()
                  return
                }
                setArmed('clear')
              }}
            >
              {armed === 'clear' ? '确认清空账本' : '清空账本'}
            </button>
          </>
        )}
      </section>
      {apiMode && <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <Wallet size={18} />
          <h3>账户期初</h3>
        </div>
        <p>期初余额不能由流水倒推；导入新建的账户需要补录「期初余额 + 期初日期」。</p>
        {openingError && !openingStep && (
          <p className="mb-set-error" role="alert">
            {openingError}
          </p>
        )}
        {unsetAccounts.length > 0 ? (
          <>
            <button
              type="button"
              className="mb-set-btn"
              onClick={() => void openOpeningStep(unsetAccounts.map((account) => account.name))}
            >
              补录期初余额（{unsetAccounts.length} 个未设）
            </button>
            <p className="mb-set-warn">
              未设期初（余额由流水推导，可能不准）：
              {unsetAccounts.map((account) => accountDisplayName(account, ledger.accounts)).join('、')}
            </p>
          </>
        ) : (
          <p>{lastImport ? '本批导入的新账户都已设置期初。' : '所有账户都已设置期初。'}</p>
        )}
        {setAccounts.length > 0 && (
          <p className="mb-set-hint">
            已设期初：
            {setAccounts
              .map(
                (account) =>
                  `${accountDisplayName(account, ledger.accounts)}（${account.initialBalanceDate}）`,
              )
              .join('、')}
          </p>
        )}
      </section>}
    </div>
    )
  }

  const renderTrash = () =>
    apiMode ? (
      <RecycleBinPanel ledger={ledger} />
    ) : (
      <div className="mb-set-list-empty is-tall">
        <Trash2 size={24} />
        <p>回收站是空的</p>
        <span>删除流水后 6 秒内可在提示中撤销；过期后才会进入这里。</span>
      </div>
    )

  const renderSection = (id: SectionId) => {
    switch (id) {
      case 'accounts':
        return renderAccounts()
      case 'categories':
        return renderCategories()
      case 'cashflow':
        return renderCashflow()
      case 'invest':
        return renderInvest()
      case 'appearance':
        return renderAppearance()
      case 'backup':
        return renderBackup()
      case 'display':
        return renderDisplay()
      case 'data':
        return renderData()
      case 'trash':
        return renderTrash()
      default:
        return null
    }
  }

  /* ===== 导航 ===== */

  const summaries: Record<SectionId, string> = {
    accounts: `资产 ${assetGroups.reduce((sum, group) => sum + group.rows.length, 0)} · 负债 ${liabilityGroups.reduce((sum, group) => sum + group.rows.length, 0)}`,
    categories: `收入 ${countByType(ledger.categories, 'income')} · 支出 ${countByType(ledger.categories, 'expense')}`,
    cashflow: '3 组标记 · 4 类活动',
    invest: `${investRows.length} 类资产`,
    appearance: themeMode === 'system' ? '跟随系统' : themeMode === 'dark' ? '深色' : '浅色',
    backup: apiMode ? (backupConfig?.enabled ? '已开启' : '未开启') : '需真实后端',
    display: '列显隐 · 排序',
    data: '导入 · 导出 · 回滚',
    trash: apiMode ? `${trashCount} 条可恢复` : '0 条可恢复',
  }

  const renderMobileList = () => (
    <div className="mb-set-mobile">
      {[
        { title: '配置中心', items: CONFIG_SECTIONS },
        { title: '通用', items: GENERAL_SECTIONS },
      ].map((group) => (
        <section key={group.title} className="mb-set-mobile-group">
          <h2 className="mb-set-group-title">{group.title}</h2>
          <div className="mb-set-list">
            {group.items.map((item) => {
              const Icon =
                item.id === 'accounts'
                  ? Wallet
                  : item.id === 'categories'
                    ? Tag
                    : item.id === 'cashflow'
                      ? TrendingUp
                      : item.id === 'invest'
                        ? TrendingUp
                        : item.id === 'appearance'
                          ? Sun
                          : item.id === 'backup'
                            ? HardDriveDownload
                            : item.id === 'display'
                              ? Tag
                              : item.id === 'data'
                                ? Database
                                : Trash2
              return (
                <button
                  key={item.id}
                  type="button"
                  className="mb-set-entry"
                  onClick={() => setOpenSection(item.id)}
                >
                  <span className="mb-set-icon">
                    <Icon size={17} />
                  </span>
                  <span className="mb-set-name">{item.label}</span>
                  <span className="mb-set-meta">{summaries[item.id]}</span>
                  <ChevronRight size={16} className="mb-set-chevron" />
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )

  if (dataState === 'loading') {
    return <LoadingSkeleton device={device} variant="settings" />
  }
  if (dataState === 'error') {
    return <ErrorPanel onRetry={onRetry} />
  }

  const empty = dataState === 'empty'

  const body = empty ? (
    <section className="mb-set-empty">
      <div className="mb-set-empty-mark" aria-hidden="true">
        <Wallet size={28} />
      </div>
      <h2>还没有账户</h2>
      <p>账本为空时设置也可以先配好：从第一个账户开始，分类与现金流标记随后补齐。</p>
      <button
        type="button"
        className="mb-set-btn is-primary"
        onClick={() => setEditor({ kind: 'account', mode: 'create', preset: 'deposit' })}
      >
        <Plus size={16} />
        新增账户
      </button>
    </section>
  ) : device === 'desktop' ? (
    <>
      <header className="mb-set-head">
        <h1 className="mb-set-title">设置</h1>
      </header>
      <div className="mb-set-layout">
        <nav className="mb-set-nav" aria-label="设置分区">
          {[
            { title: '配置中心', items: CONFIG_SECTIONS },
            { title: '通用', items: GENERAL_SECTIONS },
          ].map((group) => (
            <div key={group.title} className="mb-set-nav-group">
              <h2 className="mb-set-group-title">{group.title}</h2>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={active === item.id ? 'mb-set-nav-item is-active' : 'mb-set-nav-item'}
                  aria-current={active === item.id ? 'page' : undefined}
                  onClick={() => setActive(item.id)}
                >
                  <span>{item.label}</span>
                  <span className="mb-set-nav-count">
                    {item.id === 'trash' ? (apiMode ? String(trashCount) : '0') : ''}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <section className="mb-set-panel" aria-labelledby="mb-set-panel-title">
          <div className="mb-set-panel-head">
            <h2 id="mb-set-panel-title" className="mb-set-panel-title">
              {sectionMeta(active).label}
            </h2>
          </div>
          {renderSection(active)}
        </section>
      </div>
    </>
  ) : (
    <>
      {renderMobileList()}
      {openSection && (
        <div className="mb-set-overlay" role="dialog" aria-label={sectionMeta(openSection).label}>
          <header className="mb-set-overlay-head">
            <button
              type="button"
              className="mb-set-back"
              onClick={() => setOpenSection(null)}
            >
              <ChevronLeft size={18} />
              返回
            </button>
            <h2 className="mb-set-overlay-title">{sectionMeta(openSection).label}</h2>
            <span className="mb-set-back-space" aria-hidden="true" />
          </header>
          <div className="mb-set-overlay-body">{renderSection(openSection)}</div>
        </div>
      )}
    </>
  )

  return (
    <div className="mb-set-page" data-device={device}>
      {apiMode && <RecycleBinCountProbe ledger={ledger} onCount={setTrashCount} />}
      {body}
      {editor && (
        <EditorSheet
          editor={editor}
          device={device}
          ledger={ledger}
          investRows={investRows}
          error={editorError}
          saving={editorSaving}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
          onDelete={
            editor &&
            ((editor.kind === 'account' || editor.kind === 'accountGroup') &&
              editor.mode === 'edit')
              ? deleteEditorTarget
              : undefined
          }
          onMove={
            editor &&
            ((editor.kind === 'account' || editor.kind === 'accountGroup') &&
              editor.mode === 'edit')
              ? moveEditorTarget
              : undefined
          }
        />
      )}
      {mover && (
        <MoverSheet
          mover={mover}
          device={device}
          ledger={ledger}
          error={moverError}
          saving={moverSaving}
          onClose={() => setMover(null)}
          onMove={(target) => {
            if (mover.kind === 'activity') {
              moveActivity(mover.id, target as ActivityGroupId)
              return
            }
            void move(target)
          }}
        />
      )}
      {deleteTransfer && (
        <CategoryDeleteSheet
          row={deleteTransfer.row}
          type={deleteTransfer.type}
          device={device}
          ledger={ledger}
          error={deleteError}
          saving={deleteSaving}
          onClose={() => setDeleteTransfer(null)}
          onTransfer={(target) => void transferAndDelete(target)}
        />
      )}
      {apiMode && (
        <HfSheet
          variant="settings"
          device={device}
          opened={importOpen}
          onClose={() => {
            if (dataBusy === 'import' || dataBusy === 'preview') return
            setImportOpen(false)
          }}
          desktopSize={460}
        >
          <div className="mb-set-sheet-head">
            <h2 className="mb-set-sheet-title">导入备份</h2>
            <button
              type="button"
              className="mb-set-icon-btn"
              aria-label="关闭"
              onClick={() => setImportOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="mb-set-sheet-body">
            <label className="mb-set-field">
              <span className="mb-set-label">备份文件（.mbx / .zip / .csv / .json）</span>
              <input
                className="mb-set-input mb-set-file"
                type="file"
                accept=".mbx,.zip,.csv,.json"
                disabled={dataBusy === 'preview' || dataBusy === 'import'}
                onChange={(event) => {
                  setImportFile(event.target.files?.[0] ?? null)
                  setPreview(null)
                  setPreviewError(null)
                }}
              />
            </label>

            {previewError && (
              <p className="mb-set-error" role="alert">
                {previewError}
              </p>
            )}

            {preview ? renderImportSummary(preview) : (
              <p className="mb-set-hint">
                先解析预览：期间跨度、笔数、金额合计、无法识别的账户/分类与疑似重复都会在确认前显示。
              </p>
            )}
          </div>

          <div className="mb-set-sheet-actions">
            <button
              type="button"
              className="mb-set-btn"
              disabled={dataBusy === 'import'}
              onClick={() => setImportOpen(false)}
            >
              取消
            </button>
            {preview ? (
              <button
                type="button"
                className="mb-set-btn is-primary"
                disabled={dataBusy === 'import'}
                onClick={() => void confirmImport()}
              >
                {dataBusy === 'import' ? '导入中…' : '确认导入'}
              </button>
            ) : (
              <button
                type="button"
                className="mb-set-btn is-primary"
                disabled={dataBusy === 'preview'}
                onClick={() => void runImportPreview()}
              >
                {dataBusy === 'preview' ? '解析中…' : '解析并预览'}
              </button>
            )}
          </div>
        </HfSheet>
      )}
      {apiMode && openingStep && (
        <HfSheet
          variant="settings"
          device={device}
          opened
          onClose={() => {
            if (openingSaving) return
            skipOpeningStep()
          }}
          desktopSize={460}
        >
          <div className="mb-set-sheet-head">
            <h2 className="mb-set-sheet-title">补充期初余额</h2>
            <button
              type="button"
              className="mb-set-icon-btn"
              aria-label="关闭"
              disabled={openingSaving}
              onClick={skipOpeningStep}
            >
              <X size={18} />
            </button>
          </div>
          <div className="mb-set-sheet-body">
            <p className="mb-set-hint">
              当前有 {openingStep.accounts.length} 个账户未设期初。期初余额 = 期初日期当天开始前的余额，当天交易照常计入；
              留空表示跳过该账户，余额只能由流水推导，可能不准。
            </p>
            {openingStep.accounts.map((account) => {
              const value = openingValues[account.id] ?? {
                amount: account.initialBalance !== 0 ? String(account.initialBalance / 100) : '',
                date: account.initialBalanceDate ?? todayLocal(),
              }
              const hasOpening = account.initialBalanceDate !== null || account.initialBalance !== 0
              return (
                <div className="mb-set-preview" key={account.id}>
                  <div className="mb-set-preview-row">
                    <span>{accountDisplayName(account, ledger.accounts)}</span>
                    <b className={hasOpening ? '' : 'mb-set-warn'}>
                      {hasOpening ? `已设期初 ${account.initialBalanceDate ?? ''}` : '未设期初'}
                    </b>
                  </div>
                  <label className="mb-set-field">
                    <span className="mb-set-label">期初余额（元）</span>
                    <input
                      className="mb-set-input"
                      inputMode="decimal"
                      value={value.amount}
                      disabled={openingSaving}
                      onChange={(event) =>
                        setOpeningValues((current) => ({
                          ...current,
                          [account.id]: { ...value, amount: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="mb-set-field">
                    <span className="mb-set-label">期初余额日期</span>
                    <input
                      className="mb-set-input"
                      type="date"
                      value={value.date}
                      disabled={openingSaving}
                      onChange={(event) =>
                        setOpeningValues((current) => ({
                          ...current,
                          [account.id]: { ...value, date: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <div className="mb-set-preview-row">
                    <span>当前余额（balance-at）</span>
                    <b>{formatCurrency(minor(account.balance))}</b>
                  </div>
                </div>
              )
            })}
            {openingResult && (
              <div className="mb-set-preview">
                <div className="mb-set-preview-row">
                  <span>资产合计</span>
                  <b>
                    {formatCurrency(minor(openingResult.before.assets))} →{' '}
                    {formatCurrency(minor(openingResult.after.assets))}
                  </b>
                </div>
                <div className="mb-set-preview-row">
                  <span>负债合计</span>
                  <b>
                    {formatCurrency(minor(openingResult.before.liabilities))} →{' '}
                    {formatCurrency(minor(openingResult.after.liabilities))}
                  </b>
                </div>
                <div className="mb-set-preview-row">
                  <span>净资产</span>
                  <b>
                    {formatCurrency(minor(openingResult.before.net))} →{' '}
                    {formatCurrency(minor(openingResult.after.net))}（
                    {openingResult.after.net - openingResult.before.net >= 0 ? '+' : ''}
                    {formatCurrency(minor(openingResult.after.net - openingResult.before.net))}）
                  </b>
                </div>
              </div>
            )}
            {openingError && (
              <p className="mb-set-error" role="alert">
                {openingError}
              </p>
            )}
          </div>
          <div className="mb-set-sheet-actions">
            <button
              type="button"
              className="mb-set-btn is-ghost"
              disabled={openingSaving}
              onClick={skipOpeningStep}
            >
              跳过补录
            </button>
            {openingResult ? (
              <button type="button" className="mb-set-btn is-primary" onClick={closeOpeningStep}>
                完成
              </button>
            ) : (
              <button
                type="button"
                className="mb-set-btn is-primary"
                disabled={openingSaving}
                onClick={() => void saveOpeningStep()}
              >
                {openingSaving ? '保存中…' : '保存期初'}
              </button>
            )}
          </div>
        </HfSheet>
      )}
      {apiMode && (
        <HfSheet
          variant="settings"
          device={device}
          opened={clearOpen}
          onClose={() => {
            if (dataBusy === 'clear') return
            setClearOpen(false)
          }}
          desktopSize={460}
        >
          <div className="mb-set-sheet-head">
            <h2 className="mb-set-sheet-title">清空账本</h2>
            <button
              type="button"
              className="mb-set-icon-btn"
              aria-label="关闭"
              onClick={() => setClearOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="mb-set-sheet-body">
            <p className="mb-set-danger-note">
              清空会删除所有账户、分类、流水、预算与投资快照，且不可恢复。回收站与审计记录会一并清空。
            </p>

            <div className={backupReady ? 'mb-set-backup-state is-ready' : 'mb-set-backup-state is-blocked'}>
              <span className="mb-set-backup-reason">
                {backupReady
                  ? `已备份：${backupReady.filename}（${new Date(backupReady.at).toLocaleTimeString('zh-CN', { hour12: false })}）`
                  : '备份文件 (.mbx)'}
              </span>
              <button
                type="button"
                className="mb-set-textbtn is-boxed"
                disabled={dataBusy === 'export'}
                onClick={() => void exportApiLedger()}
              >
                {dataBusy === 'export' ? '导出中…' : backupReady ? '重新导出' : '先导出备份 (.mbx)'}
              </button>
            </div>
            {exportError && (
              <p className="mb-set-error" role="alert">
                {exportError}
              </p>
            )}

            <label className="mb-set-field">
              <span className="mb-set-label">输入「{CLEAR_WORD}」确认</span>
              <input
                className="mb-set-input"
                value={clearWord}
                placeholder={CLEAR_WORD}
                onChange={(event) => {
                  setClearWord(event.target.value)
                  setClearError(null)
                }}
              />
            </label>

            {clearError && (
              <p className="mb-set-error" role="alert">
                {clearError}
              </p>
            )}
          </div>

          {/* 禁用原因紧贴确认按钮上方：不要把理由埋在表单中部。 */}
          {!backupReady && (
            <p className="mb-set-clear-gate" id="mb-set-clear-reason">
              尚未导出备份：必须先导出备份才能继续
            </p>
          )}
          <div className="mb-set-sheet-actions">
            <button type="button" className="mb-set-btn" disabled={dataBusy === 'clear'} onClick={() => setClearOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="mb-set-btn is-danger"
              disabled={!backupReady || dataBusy === 'clear'}
              aria-describedby={!backupReady ? 'mb-set-clear-reason' : undefined}
              onClick={() => void confirmClearLedger()}
            >
              {dataBusy === 'clear' ? '清空中…' : '确认清空'}
            </button>
          </div>
        </HfSheet>
      )}
    </div>
  )
}
