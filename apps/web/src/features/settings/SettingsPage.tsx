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
import { createPortal } from 'react-dom'
import { Drawer } from '@mantine/core'
import { getPortalHost } from '@/features/shared/portalHost'
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
  Landmark,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { minor } from '@domain/index'
import { formatCurrency } from '@/utils/format'
import { useLedger } from '@/features/overview/ledgerStore'
import type { AccountKind, TxType } from '@/features/overview/model'
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
  ACCOUNT_KIND_LABEL,
  ACTIVITY_GROUPS,
  ASSET_KINDS,
  ASSET_MARK_GROUPS,
  CONFIG_SECTIONS,
  GENERAL_SECTIONS,
  INVESTMENT_TYPES,
  LIABILITY_KINDS,
  accountGroups,
  addAccount,
  addCategory,
  categoryDescendantIds,
  categoryRows,
  defaultActivity,
  moveCategory,
  removeAccount,
  removeCategory,
  sectionMeta,
  transferCategoryTransactions,
  updateAccount,
  updateCategory,
  type AccountGroup,
  type AccountRow,
  type ActivityGroupId,
  type CategoryRow,
  type InvestmentTypeRow,
  type SectionId,
} from './settingsModel'
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

type CategoryTab = 'income' | 'expense' | 'transfer'

const CATEGORY_TABS: readonly { type: CategoryTab; label: string }[] = [
  { type: 'income', label: '收入' },
  { type: 'expense', label: '支出' },
  { type: 'transfer', label: '转账' },
]

const CASHFLOW_TABS: readonly { id: 'asset' | 'income' | 'expense' | 'transfer'; label: string }[] = [
  { id: 'asset', label: '资产分类' },
  { id: 'income', label: '收入分类' },
  { id: 'expense', label: '支出分类' },
  { id: 'transfer', label: '转账分类' },
]

type Editor =
  | { kind: 'account'; mode: 'create' | 'edit'; accountId?: string; preset: AccountKind }
  | { kind: 'category'; mode: 'create' | 'edit'; type: TxType; parentId?: string; categoryId?: string }
  | { kind: 'invest'; id: string }

type Mover =
  | { kind: 'account'; id: string; name: string; current: AccountKind }
  | {
      kind: 'category'
      id: string
      name: string
      type: TxType
      currentParentId: string | null
    }
  | { kind: 'activity'; id: string; name: string; current: ActivityGroupId }

interface MenuItem {
  label: string
  key: string
  danger?: boolean
  disabled?: boolean
  hint?: string
  /** 需要二次确认的操作：第一次点击变成「确认删除」，3 秒未确认自动复位。 */
  confirm?: boolean
  onSelect: () => void
}

function countByType(categories: readonly { type: TxType }[], type: TxType): number {
  return categories.filter((category) => category.type === type).length
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

function RowMenu({
  id,
  items,
  openId,
  onOpen,
  confirming,
  onConfirm,
}: {
  id: string
  items: MenuItem[]
  openId: string | null
  onOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
}) {
  const open = openId === id
  return (
    <div className="mb-set-more-wrap">
      <button
        type="button"
        className="mb-set-more"
        aria-label="更多操作"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onOpen(open ? null : id)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="mb-set-menu" role="menu">
          {items.map((item) => {
            const armed = item.confirm && confirming === item.key
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={
                  armed || item.danger ? 'mb-set-menu-item is-danger' : 'mb-set-menu-item'
                }
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return
                  if (item.confirm && confirming !== item.key) {
                    onConfirm(item.key)
                    return
                  }
                  onOpen(null)
                  item.onSelect()
                }}
              >
                <span>{armed ? '确认删除' : item.label}</span>
                {item.disabled && item.hint && (
                  <span className="mb-set-menu-hint">{item.hint}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EditorSheet({
  editor,
  device,
  ledger,
  investRows,
  onClose,
  onSave,
}: {
  editor: Editor | null
  device: DeviceMode
  ledger: ReturnType<typeof useLedger>['ledger']
  investRows: readonly InvestmentTypeRow[]
  onClose: () => void
  onSave: (value: { name: string; kind: AccountKind; balance: number; target: number }) => void
}) {
  const account =
    editor?.kind === 'account' && editor.mode === 'edit'
      ? ledger.accounts.find((item) => item.id === editor.accountId)
      : undefined
  const category =
    editor?.kind === 'category' && editor.mode === 'edit'
      ? ledger.categories.find((item) => item.id === editor.categoryId)
      : undefined
  const invest = editor?.kind === 'invest' ? investRows.find((item) => item.id === editor.id) : undefined

  const initialName = account?.name ?? category?.name ?? invest?.name ?? ''
  const initialKind =
    editor?.kind === 'account' ? (account?.kind ?? editor.preset) : ('deposit' as AccountKind)
  const initialBalance = account ? account.balance / 100 : 0
  const initialTarget = invest?.target ?? 0

  const [name, setName] = useState(initialName)
  const [kind, setKind] = useState<AccountKind>(initialKind)
  const [balance, setBalance] = useState(String(initialBalance))
  const [target, setTarget] = useState(String(initialTarget))

  useEffect(() => {
    setName(initialName)
    setKind(initialKind)
    setBalance(String(initialBalance))
    setTarget(String(initialTarget))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  if (!editor) return null

  const title =
    editor.kind === 'account'
      ? editor.mode === 'create'
        ? '新增账户'
        : '编辑账户'
      : editor.kind === 'category'
        ? editor.mode === 'create'
          ? editor.parentId
            ? '新增子分类'
            : '新增一级分类'
          : '编辑分类'
        : '编辑投资资产类型'

  const valid =
    name.trim().length > 0 &&
    (editor.kind !== 'account' || Number.isFinite(Number(balance))) &&
    (editor.kind !== 'invest' || Number.isFinite(Number(target)))

  return (
    <Drawer
      opened
      onClose={onClose}
      position={device === 'mobile' ? 'bottom' : 'right'}
      size={device === 'mobile' ? 'auto' : 380}
      withinPortal={false}
      withCloseButton={false}
      classNames={{ content: 'mb-set-sheet', body: 'mb-set-sheet-body', inner: 'mb-set-sheet-inner' }}
    >
      <div className="mb-set-sheet-head">
        <h2 className="mb-set-sheet-title">{title}</h2>
        <button type="button" className="mb-set-icon-btn" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="mb-set-sheet-body">
        <label className="mb-set-field">
          <span className="mb-set-label">名称</span>
          <input
            className="mb-set-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={editor.kind === 'account' ? '如「招商储蓄卡」' : '如「餐饮」'}
          />
        </label>

        {editor.kind === 'account' && (
          <>
            <div className="mb-set-field">
              <span className="mb-set-label">账户性质</span>
              <div className="mb-set-kind-grid" role="group" aria-label="账户性质">
                {[...ASSET_KINDS, ...LIABILITY_KINDS].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={kind === value ? 'mb-set-kind is-active' : 'mb-set-kind'}
                    aria-pressed={kind === value}
                    onClick={() => setKind(value)}
                  >
                    {ACCOUNT_KIND_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>
            <label className="mb-set-field">
              <span className="mb-set-label">当前余额</span>
              <input
                className="mb-set-input"
                inputMode="decimal"
                value={balance}
                onChange={(event) => setBalance(event.target.value)}
                placeholder="0.00"
              />
            </label>
          </>
        )}

        {editor.kind === 'category' && (
          <div className="mb-set-field">
            <span className="mb-set-label">类型</span>
            <div className="mb-set-static">
              {CATEGORY_TABS.find((tab) => tab.type === editor.type)?.label}
              {editor.parentId ? ' · 二级分类' : ' · 一级分类'}
            </div>
          </div>
        )}

        {editor.kind === 'invest' && (
          <label className="mb-set-field">
            <span className="mb-set-label">目标占比（%）</span>
            <input
              className="mb-set-input"
              inputMode="decimal"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>
        )}

        <div className="mb-set-sheet-actions">
          <button type="button" className="mb-set-btn is-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="mb-set-btn is-primary"
            disabled={!valid}
            onClick={() =>
              onSave({
                name: name.trim(),
                kind,
                balance: Math.round(Number(balance) * 100),
                target: Number(target),
              })
            }
          >
            保存
          </button>
        </div>
      </div>
    </Drawer>
  )
}

function MoverSheet({
  mover,
  device,
  ledger,
  onClose,
  onMove,
}: {
  mover: Mover | null
  device: DeviceMode
  ledger: ReturnType<typeof useLedger>['ledger']
  onClose: () => void
  onMove: (target: string) => void
}) {
  if (!mover) return null

  const options: { id: string; label: string; current: boolean }[] =
    mover.kind === 'account'
      ? [...ASSET_KINDS, ...LIABILITY_KINDS].map((value) => ({
          id: value,
          label: `${ACCOUNT_KIND_LABEL[value]}账户`,
          current: value === mover.current,
        }))
      : mover.kind === 'activity'
        ? ACTIVITY_GROUPS.map((group) => ({
            id: group.id,
            label: group.label,
            current: group.id === mover.current,
          }))
        : [
            { id: 'root', label: '顶层（无父级）', current: mover.currentParentId === null },
            ...ledger.categories
              .filter(
                (category) =>
                  category.type === mover.type &&
                  !category.parentId &&
                  category.id !== mover.id &&
                  !categoryDescendantIds(ledger, mover.id).includes(category.id),
              )
              .map((category) => ({ id: category.id, label: category.name, current: false })),
          ]

  return (
    <Drawer
      opened
      onClose={onClose}
      position={device === 'mobile' ? 'bottom' : 'right'}
      size={device === 'mobile' ? 'auto' : 380}
      withinPortal={false}
      withCloseButton={false}
      classNames={{ content: 'mb-set-sheet', body: 'mb-set-sheet-body', inner: 'mb-set-sheet-inner' }}
    >
      <div className="mb-set-sheet-head">
        <h2 className="mb-set-sheet-title">移动「{mover.name}」到…</h2>
        <button type="button" className="mb-set-icon-btn" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="mb-set-sheet-body">
        <div className="mb-set-radio-list" role="radiogroup" aria-label="目标位置">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={option.current}
              className={option.current ? 'mb-set-radio is-current' : 'mb-set-radio'}
              disabled={option.current}
              onClick={() => onMove(option.id)}
            >
              <span className="mb-set-radio-dot" aria-hidden="true" />
              <span>{option.label}</span>
              {option.current && <span className="mb-set-radio-now">当前</span>}
            </button>
          ))}
        </div>
        <p className="mb-set-hint">移动只改归属，不改名称、余额与已有流水。</p>
      </div>
    </Drawer>
  )
}

function CategoryDeleteSheet({
  row,
  type,
  device,
  ledger,
  onClose,
  onTransfer,
}: {
  row: CategoryRow
  type: TxType
  device: DeviceMode
  ledger: ReturnType<typeof useLedger>['ledger']
  onClose: () => void
  onTransfer: (targetId: string) => void
}) {
  const ids = new Set([row.id, ...categoryDescendantIds(ledger, row.id)])
  const options = ledger.categories
    .filter((category) => category.type === type && !ids.has(category.id))
    .sort((left, right) => Number(Boolean(left.parentId)) - Number(Boolean(right.parentId)))

  return (
    <Drawer
      opened
      onClose={onClose}
      position={device === 'mobile' ? 'bottom' : 'right'}
      size={device === 'mobile' ? 'auto' : 380}
      withinPortal={false}
      withCloseButton={false}
      classNames={{ content: 'mb-set-sheet', body: 'mb-set-sheet-body', inner: 'mb-set-sheet-inner' }}
    >
      <div className="mb-set-sheet-head">
        <h2 className="mb-set-sheet-title">删除「{row.name}」</h2>
        <button type="button" className="mb-set-icon-btn" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="mb-set-sheet-body">
        <p className="mb-set-hint">
          共 {row.txCount} 笔交易引用这个分类（含子分类）。选择目标分类后，这些流水会整体转移，然后删除「{row.name}」。
        </p>
        <div className="mb-set-radio-list" role="radiogroup" aria-label="转移目标分类">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={false}
              className="mb-set-radio"
              onClick={() => onTransfer(option.id)}
            >
              <span className="mb-set-radio-dot" aria-hidden="true" />
              <span>{option.name}</span>
            </button>
          ))}
        </div>
        {options.length === 0 && (
          <p className="mb-set-hint">没有可转移的同类型分类，请先新建一个分类。</p>
        )}
      </div>
    </Drawer>
  )
}

export function SettingsPage({ device, dataState, onRetry, onImport }: SettingsPageProps) {
  const { ledger, replaceLedger } = useLedger()
  const [active, setActive] = useState<SectionId>('accounts')
  const [openSection, setOpenSection] = useState<SectionId | null>(null)
  const [accountTab, setAccountTab] = useState<'asset' | 'liability'>('asset')
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('expense')
  const [cashTab, setCashTab] = useState<'asset' | 'income' | 'expense' | 'transfer'>('asset')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [mover, setMover] = useState<Mover | null>(null)
  const [deleteTransfer, setDeleteTransfer] = useState<{ row: CategoryRow; type: TxType } | null>(null)
  const [toast, setToast] = useState<{
    message: string
    duration: number
    action?: { label: string; run: () => void }
  } | null>(null)
  const [display, setDisplay] = useState<DisplaySettings>(readDisplaySettings)
  const [activity, setActivity] = useState<Record<string, ActivityGroupId>>({})
  const [investRows, setInvestRows] = useState<readonly InvestmentTypeRow[]>(INVESTMENT_TYPES)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  const notify = (message: string) => setToast({ message, duration: 2600 })
  // 危险操作（转移后删除）与批量删除一致：6 秒内可撤销。
  const notifyUndoable = (message: string, run: () => void) =>
    setToast({ message, duration: 6000, action: { label: '撤销', run } })

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), toast.duration)
    return () => window.clearTimeout(timer)
  }, [toast])

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

  const assetGroups = useMemo(() => accountGroups(ledger, ASSET_KINDS), [ledger])
  const liabilityGroups = useMemo(() => accountGroups(ledger, LIABILITY_KINDS), [ledger])
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

  const saveEditor = (value: { name: string; kind: AccountKind; balance: number; target: number }) => {
    if (!editor) return
    if (editor.kind === 'account') {
      if (editor.mode === 'edit' && editor.accountId) {
        replaceLedger(
          updateAccount(ledger, editor.accountId, {
            name: value.name,
            kind: value.kind,
            balance: value.balance,
          }),
        )
        notify('账户已更新')
      } else {
        replaceLedger(addAccount(ledger, { name: value.name, kind: value.kind, balance: value.balance }))
        notify('账户已新增')
      }
    } else if (editor.kind === 'category') {
      if (editor.mode === 'edit' && editor.categoryId) {
        replaceLedger(updateCategory(ledger, editor.categoryId, value.name))
        notify('分类已重命名')
      } else {
        replaceLedger(
          addCategory(ledger, { name: value.name, type: editor.type, parentId: editor.parentId }),
        )
        notify('分类已新增')
      }
    } else {
      setInvestRows((rows) =>
        rows.map((row) => (row.id === editor.id ? { ...row, target: value.target } : row)),
      )
      notify('目标占比已更新')
    }
    setEditor(null)
  }

  const deleteAccount = (account: AccountRow) => {
    if (account.txCount > 0) return
    replaceLedger(removeAccount(ledger, account.id))
    notify('账户已删除')
  }

  const deleteCategory = (row: CategoryRow) => {
    replaceLedger(removeCategory(ledger, row.id))
    notify('分类已删除')
  }

  const transferAndDelete = (targetId: string) => {
    if (!deleteTransfer) return
    const { row } = deleteTransfer
    const targetName =
      ledger.categories.find((item) => item.id === targetId)?.name ?? '目标分类'
    // 撤销必须恢复原分类与记录归属：快照整份账本，比逐条回填更可靠。
    const before = ledger
    replaceLedger(removeCategory(transferCategoryTransactions(ledger, row.id, targetId), row.id))
    notifyUndoable(`已转移 ${row.txCount} 笔到「${targetName}」并删除「${row.name}」`, () => {
      replaceLedger(before)
      notify('已撤销转移与删除')
    })
    setDeleteTransfer(null)
  }

  const move = (target: string) => {
    if (!mover) return
    if (mover.kind === 'account') {
      const account = ledger.accounts.find((item) => item.id === mover.id)
      if (account) replaceLedger(updateAccount(ledger, account.id, { ...account, kind: target as AccountKind }))
      notify('账户已移动到新分类')
    } else {
      replaceLedger(moveCategory(ledger, mover.id, target === 'root' ? null : target))
      notify('分类已移动')
    }
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
    notify('账本已清空（刷新页面可恢复演示数据）')
    setArmed(null)
  }

  /* ===== 行渲染 ===== */

  const renderAccountGroup = (group: AccountGroup) => {
    const Icon = ACCOUNT_ICONS[group.kind]
    const expandedRow = !collapsed.has(`acc-${group.kind}`)
    return (
      <div key={group.kind} className="mb-set-group">
        <div className="mb-set-row is-group">
          <button
            type="button"
            className="mb-set-fold"
            aria-label={expandedRow ? '收起账户' : '展开账户'}
            aria-expanded={expandedRow}
            onClick={() => toggleCollapsed(`acc-${group.kind}`)}
          >
            {expandedRow ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <span className="mb-set-drag" aria-hidden="true">
            <GripVertical size={14} />
          </span>
          <span className="mb-set-icon">
            <Icon size={16} />
          </span>
          <span className="mb-set-name">{group.label}</span>
          <span className="mb-set-meta">{group.rows.length} 个账户</span>
          <RowMenu
            id={`group-${group.kind}`}
            openId={menuOpen}
            onOpen={setMenuOpen}
            confirming={confirming}
            onConfirm={setConfirming}
            items={[
              {
                key: `add-${group.kind}`,
                label: '新增账户',
                onSelect: () => setEditor({ kind: 'account', mode: 'create', preset: group.kind }),
              },
              {
                key: `del-${group.kind}`,
                label: '删除',
                danger: true,
                confirm: true,
                disabled: group.rows.length > 0,
                hint: '分类下仍有账户，先移动或删除账户',
                onSelect: () => notify('分类下仍有账户，不能删除'),
              },
            ]}
          />
        </div>
        {expandedRow &&
          group.rows.map((account) => (
            <div key={account.id} className="mb-set-row is-child">
              <span className="mb-set-child-space" aria-hidden="true" />
              <span className="mb-set-drag" aria-hidden="true">
                <GripVertical size={14} />
              </span>
              <span className="mb-set-icon">
                <Icon size={16} />
              </span>
              <span className="mb-set-name">{account.name}</span>
              <span className="mb-set-meta">
                {formatCurrency(minor(account.balance))} · {account.txCount} 笔
              </span>
              <RowMenu
                id={`acc-${account.id}`}
                openId={menuOpen}
                onOpen={setMenuOpen}
                confirming={confirming}
                onConfirm={setConfirming}
                items={[
                  {
                    key: `edit-${account.id}`,
                    label: '编辑',
                    onSelect: () =>
                      setEditor({ kind: 'account', mode: 'edit', accountId: account.id, preset: group.kind }),
                  },
                  {
                    key: `move-${account.id}`,
                    label: '移动到…',
                    onSelect: () =>
                      setMover({
                        kind: 'account',
                        id: account.id,
                        name: account.name,
                        current: group.kind,
                      }),
                  },
                  {
                    key: `del-${account.id}`,
                    label: '删除',
                    danger: true,
                    confirm: true,
                    disabled: account.txCount > 0,
                    hint: `${account.txCount} 笔交易引用此账户，不能删除`,
                    onSelect: () => deleteAccount(account),
                  },
                ]}
              />
            </div>
          ))}
        {expandedRow && group.rows.length === 0 && (
          <div className="mb-set-row is-child is-empty">
            <span className="mb-set-meta">还没有账户</span>
          </div>
        )}
      </div>
    )
  }

  const renderCategoryRow = (row: CategoryRow, type: TxType, level: number) => {
    const expandedRow = !collapsed.has(`cat-${row.id}`)
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
                key: `del-${row.id}`,
                label: '删除',
                danger: true,
                // 有子分类时先处理层级；仅被交易引用时打开转移弹窗，完成转移即删除。
                confirm: row.childCount === 0 && row.txCount === 0,
                disabled: row.childCount > 0,
                hint: row.childCount > 0 ? '有子分类，先处理子分类' : undefined,
                onSelect: () => {
                  if (row.txCount > 0) {
                    setDeleteTransfer({ row, type })
                    return
                  }
                  deleteCategory(row)
                },
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
    return (
      <>
        <div className="mb-set-toolbar">
          <div className="mb-set-tabs" role="tablist" aria-label="账户分类">
            {[
              { id: 'asset' as const, label: '资产分类' },
              { id: 'liability' as const, label: '负债分类' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={accountTab === tab.id}
                className={accountTab === tab.id ? 'mb-set-tab is-active' : 'mb-set-tab'}
                onClick={() => setAccountTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-set-list">{groups.map(renderAccountGroup)}</div>
        <p className="mb-set-hint">
          账户性质决定图标与现金流标记；名称、余额与归属都在这里改。删除分类前需先清空其下账户。
        </p>
      </>
    )
  }

  const renderCategories = () => {
    const rows = rowsByType[categoryTab]
    return (
      <>
        <div className="mb-set-toolbar">
          <div className="mb-set-tabs" role="tablist" aria-label="收支分类">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.type}
                type="button"
                role="tab"
                aria-selected={categoryTab === tab.type}
                className={categoryTab === tab.type ? 'mb-set-tab is-active' : 'mb-set-tab'}
                onClick={() => setCategoryTab(tab.type)}
              >
                {tab.label}
              </button>
            ))}
          </div>
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
        <p className="mb-set-hint">有子分类的分类要先处理子分类；有交易引用的删除时会先让你选目标分类，把交易整体转移后再删除。转账分类只影响流水归类，不计入收支。</p>
      </>
    )
  }

  const renderCashflow = () => {
    if (cashTab === 'asset') {
      return (
        <>
          <div className="mb-set-toolbar">
            <div className="mb-set-tabs" role="tablist" aria-label="现金流分类">
              {CASHFLOW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={cashTab === tab.id}
                  className={cashTab === tab.id ? 'mb-set-tab is-active' : 'mb-set-tab'}
                  onClick={() => setCashTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-set-list">
            {ASSET_MARK_GROUPS.map((group) => {
              const rows = ledger.accounts.filter((account) => group.kinds.includes(account.kind))
              const groupKey = `cf-asset-${group.id}`
              const open = !collapsed.has(groupKey)
              return (
                <div key={group.id} className="mb-set-group">
                  <div className="mb-set-row is-group">
                    <button
                      type="button"
                      className="mb-set-fold"
                      aria-label={open ? '收起分类' : '展开分类'}
                      aria-expanded={open}
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
                          <span className="mb-set-name">{account.name}</span>
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
                                    current: account.kind,
                                  }),
                              },
                            ]}
                          />
                        </div>
                      )
                    })}
                  {open && rows.length === 0 && (
                    <div className="mb-set-row is-child is-empty">
                      <span className="mb-set-meta">没有账户</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mb-set-hint">
            资产按现金流标记分组；把账户移动到另一组即改变它的现金等价 / 投资 / 其他标记。负债分类不进此表。
          </p>
        </>
      )
    }

    const type = cashTab
    const rows = rowsByType[type]
    const flat = rows.map((row) => ({ row, group: activityOf(row.id) }))
    return (
      <>
        <div className="mb-set-toolbar">
          <div className="mb-set-tabs" role="tablist" aria-label="现金流分类">
            {CASHFLOW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={cashTab === tab.id}
                className={cashTab === tab.id ? 'mb-set-tab is-active' : 'mb-set-tab'}
                onClick={() => setCashTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-set-list">
          {ACTIVITY_GROUPS.map((group) => {
            const groupRows = flat.filter((item) => item.group === group.id)
            const groupKey = `cf-${type}-${group.id}`
            const open = !collapsed.has(groupKey)
            return (
              <div key={group.id} className="mb-set-group">
                <div className="mb-set-row is-group">
                  <button
                    type="button"
                    className="mb-set-fold"
                    aria-label={open ? '收起分类' : '展开分类'}
                    aria-expanded={open}
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
                {open && groupRows.length === 0 && (
                  <div className="mb-set-row is-child is-empty">
                    <span className="mb-set-meta">未分配</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="mb-set-hint">活动归属只影响现金流报表分组；子分类随父分类的归属计算。</p>
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
      <p className="mb-set-hint">目标占比参与报表「资产分布」的偏离计算；快照中仍有持仓的类型不能删除。</p>
    </>
  )

  const renderDisplay = () => {
    const columns: { key: 'showNote' | 'showAccount' | 'fixed'; label: string; desc: string }[] = [
      { key: 'showNote', label: '备注列', desc: '在流水列表显示备注' },
      { key: 'showAccount', label: '账户列', desc: '在流水列表显示所属账户' },
      { key: 'fixed', label: '金额与分类', desc: '必需列，始终显示' },
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
                <span className="mb-set-meta">{column.desc}</span>
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
        <p className="mb-set-hint">列集合固定，只能显隐；改动即时同步到流水页工具栏「显示」。</p>
      </>
    )
  }

  const renderData = () => (
    <div className="mb-set-data">
      <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <Database size={18} />
          <h3>导出</h3>
        </div>
        <p>把当前账本原样导出为 JSON，包含账户、分类、预算与全部流水。</p>
        <button type="button" className="mb-set-btn" onClick={exportLedger}>
          <Download size={16} />
          导出账本
        </button>
      </section>
      <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <FolderInput size={18} />
          <h3>导入</h3>
        </div>
        <p>支持支付宝、微信与银行账单，导入后可回滚到导入前的存点。</p>
        <button type="button" className="mb-set-btn" onClick={onImport}>
          <FolderInput size={16} />
          打开导入向导
        </button>
      </section>
      <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <RotateCcw size={18} />
          <h3>回滚</h3>
        </div>
        <p>还原到最近一次自动存点，回滚前会再存一个还原点。</p>
        <button
          type="button"
          className={armed === 'rollback' ? 'mb-set-btn is-danger is-armed' : 'mb-set-btn'}
          onClick={() => {
            if (armed === 'rollback') {
              setArmed(null)
              notify('已恢复到上一存点（演示环境不写库）')
              return
            }
            setArmed('rollback')
          }}
        >
          {armed === 'rollback' ? '确认恢复' : '回滚到上一存点'}
        </button>
      </section>
      <section className="mb-set-datacard is-danger">
        <div className="mb-set-datacard-head">
          <AlertTriangle size={18} />
          <h3>危险区</h3>
        </div>
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
      </section>
    </div>
  )

  const renderTrash = () => (
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
    display: '列显隐 · 排序',
    data: '导入 · 导出 · 回滚',
    trash: '0 条可恢复',
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
        <p className="mb-set-sub">账户、分类与数据的唯一配置入口；改动即时同步到总览、流水与报表。</p>
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
                    {item.id === 'trash' ? '0' : ''}
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
            <p className="mb-set-panel-desc">{sectionMeta(active).desc}</p>
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
      {body}
      {editor && (
        <EditorSheet
          editor={editor}
          device={device}
          ledger={ledger}
          investRows={investRows}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
        />
      )}
      {mover && (
        <MoverSheet
          mover={mover}
          device={device}
          ledger={ledger}
          onClose={() => setMover(null)}
          onMove={(target) => {
            if (mover.kind === 'activity') {
              moveActivity(mover.id, target as ActivityGroupId)
              return
            }
            move(target)
          }}
        />
      )}
      {deleteTransfer && (
        <CategoryDeleteSheet
          row={deleteTransfer.row}
          type={deleteTransfer.type}
          device={device}
          ledger={ledger}
          onClose={() => setDeleteTransfer(null)}
          onTransfer={transferAndDelete}
        />
      )}
      {toast &&
        createPortal(
          <div className="mb-hf-toast" role="status">
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="mb-hf-toast-action"
                onClick={() => {
                  toast.action?.run()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>,
          getPortalHost(),
        )}
    </div>
  )
}
