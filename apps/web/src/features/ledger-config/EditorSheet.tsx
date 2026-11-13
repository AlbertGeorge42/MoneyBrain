/**
 * 设置页编辑抽屉：账户 / 账户分组 / 收支分类共用。
 *
 * 表单初值由 editor 与账本派生，保存动作按 editor.kind 由页面分发；
 * 抽屉本身只负责输入与校验，不直接改账本。
 */
import { useEffect, useState } from 'react'
import { ChevronRight, Trash2, X } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import { todayLocal } from '@/features/overview/apiLedger'
import { parseMoneyInput } from '@/utils/money'
import { resolveCategoryIcon, type CategoryIconGroupId } from '@/features/overview/categoryIcons'
import type { AccountKind, Ledger, TxType } from '@/features/overview/model'
import { ACCOUNT_KIND_LABEL, CATEGORY_TABS } from './model'
import { IconPickerSheet } from './IconPickerSheet'

export type Editor =
  | {
      kind: 'account'
      mode: 'create' | 'edit'
      accountId?: string
      preset: AccountKind
      /** 新建时预选的分组 id；编辑时以账户当前分组为准。 */
      groupId?: string
    }
  | {
      kind: 'accountGroup'
      mode: 'create' | 'edit'
      type: 'asset' | 'liability'
      groupId?: string
    }
  | { kind: 'category'; mode: 'create' | 'edit'; type: TxType; parentId?: string; categoryId?: string }

export interface EditorSaveValue {
  name: string
  kind: AccountKind
  /** 选中分组 id；null = 未分组；undefined = 种子账本按性质回退。 */
  categoryId?: string | null
  /** 当前余额 / 新建时的初始余额（分）。 */
  balance: number
  /** 期初余额（分）。 */
  initialBalance: number
  /** 期初余额日期（YYYY-MM-DD）。 */
  initialBalanceDate: string
  /** 受控图标 key；仅分类 / 账户分组使用，null = 自动。 */
  iconKey?: string | null
}

export function EditorSheet({
  editor,
  device,
  ledger,
  error,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  editor: Editor | null
  device: DeviceMode
  ledger: Ledger
  error: string | null
  saving: boolean
  onClose: () => void
  onSave: (value: EditorSaveValue) => void
  onDelete?: () => void
}) {
  const account =
    editor?.kind === 'account' && editor.mode === 'edit'
      ? ledger.accounts.find((item) => item.id === editor.accountId)
      : undefined
  const category =
    editor?.kind === 'category' && editor.mode === 'edit'
      ? ledger.categories.find((item) => item.id === editor.categoryId)
      : undefined
  const group =
    editor?.kind === 'accountGroup' && editor.mode === 'edit'
      ? (ledger.accountCategories ?? []).find((item) => item.id === editor.groupId)
      : undefined
  /** 真实账本才有可管理的分组；种子账本退回「账户性质」四选一。 */
  const groupMode = Boolean(ledger.accountCategories)
  const initialKind =
    editor?.kind === 'account' ? (account?.kind ?? editor.preset) : ('deposit' as AccountKind)
  // 账户性质由所属分组决定，所以分组下拉只列同一归属的一级分组。
  const groupType = initialKind === 'credit' ? 'liability' : 'asset'
  const groupOptions = (ledger.accountCategories ?? []).filter((item) => item.type === groupType)
  /** 分组重名在真实库里很常见（导入残留），下拉里也用尾号区分。 */
  const groupOptionLabel = (item: (typeof groupOptions)[number]) => {
    const duplicated = groupOptions.filter((other) => other.name === item.name).length > 1
    return `${item.name}${duplicated ? ` · #${item.id.slice(-4)}` : ''}`
  }
  const defaultGroupId = editor?.kind === 'account' ? editor.groupId : undefined
  const initialGroupId = account?.categoryId ?? defaultGroupId ?? ''

  // 有流水后，期初余额冻结：改当前余额会自动落平账分录，不再折算期初。
  const hasTransactions =
    editor?.kind === 'account' &&
    editor.mode === 'edit' &&
    Boolean(account?.id) &&
    ledger.transactions.some(
      (transaction) => transaction.accountId === account?.id || transaction.toAccountId === account?.id,
    )
  const initialName = account?.name ?? category?.name ?? group?.name ?? ''
  const currentBalance = account ? account.balance / 100 : 0
  const openingBalance = account?.initialBalance !== undefined ? account.initialBalance / 100 : currentBalance
  const openingDate = account?.initialBalanceDate ?? todayLocal()
  // 分类与一级账户分组可选图标；空串表示「自动」，保存时转成 null。
  const initialIconKey = category?.iconKey ?? group?.iconKey ?? ''

  const [name, setName] = useState(initialName)
  const [kind, setKind] = useState<AccountKind>(initialKind)
  const [groupId, setGroupId] = useState(initialGroupId)
  const [balance, setBalance] = useState(String(currentBalance))
  const [initialBalance, setInitialBalance] = useState(String(openingBalance))
  const [initialBalanceDate, setInitialBalanceDate] = useState(openingDate)
  const [iconKey, setIconKey] = useState(initialIconKey)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  const currentCategory = account?.categoryId
    ? (ledger.accountCategories ?? []).find((item) => item.id === account.categoryId)
    : undefined
  const selectedGroup = groupId
    ? (ledger.accountCategories ?? []).find((item) => item.id === groupId)
    : undefined
  // 后端口径落差：现金等价 / 投资标识挂在 AccountCategory 上，换分组就是换标识。
  // 界面上不曝光这两个开关，但改动前必须提示数值口径会变，不能静默。
  const flagChanged =
    editor?.kind === 'account' &&
    editor.mode === 'edit' &&
    Boolean(selectedGroup) &&
    (Boolean(currentCategory?.isCashEquivalent) !== Boolean(selectedGroup?.isCashEquivalent) ||
      Boolean(currentCategory?.isInvestment) !== Boolean(selectedGroup?.isInvestment))

  useEffect(() => {
    setName(initialName)
    setKind(initialKind)
    setGroupId(initialGroupId)
    setBalance(String(currentBalance))
    setInitialBalance(String(openingBalance))
    setInitialBalanceDate(openingDate)
    setIconKey(initialIconKey)
    setIconPickerOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  if (!editor) return null

  const title =
    editor.kind === 'account'
      ? editor.mode === 'create'
        ? '新增账户'
        : '编辑账户'
      : editor.kind === 'accountGroup'
        ? editor.mode === 'create'
          ? `新增${editor.type === 'liability' ? '负债' : '资产'}分组`
          : '编辑分组'
        : editor.mode === 'create'
          ? editor.parentId
            ? '新增子分类'
            : '新增一级分类'
          : '编辑分类'

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(initialBalanceDate)
  // 负债 / 期初反推会给出负余额，0 也合法；解析内核统一走 Domain，表单只判 null。
  const balanceCents = parseMoneyInput(balance, { allowNegative: true, allowZero: true })
  const initialBalanceCents = parseMoneyInput(initialBalance, { allowNegative: true, allowZero: true })
  const valid =
    name.trim().length > 0 &&
    (editor.kind !== 'account' ||
      (!groupMode || editor.mode === 'edit' || groupId !== '') &&
      (balanceCents !== null && initialBalanceCents !== null && dateValid))

  const handleSave = () => {
    if (balanceCents === null || initialBalanceCents === null) return
    onSave({
      name: name.trim(),
      kind,
      categoryId:
        editor.kind === 'account' && groupMode
          ? groupId === ''
            ? editor.mode === 'edit'
              ? null
              : undefined
            : groupId
          : undefined,
      balance:
        editor.kind === 'account' && editor.mode === 'create'
          ? initialBalanceCents
          : balanceCents,
      initialBalance: initialBalanceCents,
      initialBalanceDate,
      iconKey:
        editor.kind === 'category' || editor.kind === 'accountGroup'
          ? iconKey || null
          : undefined,
    })
  }

  const duplicateGroup =
    editor.kind === 'accountGroup'
      ? (ledger.accountCategories ?? []).filter(
          (item) =>
            item.type === editor.type &&
            item.id !== editor.groupId &&
            item.name.trim() === name.trim(),
        )
      : []
  const editedGroupAccountCount =
    editor.kind === 'accountGroup' && editor.groupId
      ? ledger.accounts.filter((item) => item.categoryId === editor.groupId).length
      : 0

  // 推荐逻辑：账户分组优先展示账户类（钱包 / 银行卡 / 房产 / 股票 / 基金 / 负债），
  // 收入分类优先展示收入类。只调整分组顺序并标注「推荐」，不预选任何值——默认仍是「自动」。
  const recommendedGroup: CategoryIconGroupId | null =
    editor.kind === 'accountGroup'
      ? 'account'
      : editor.kind === 'category' && editor.type === 'income'
        ? 'income'
        : null
  // 当前图标：选了具体 key 就用它，否则按名称回退（与账本里的显示同一口径）。
  const currentIcon = resolveCategoryIcon(iconKey || null, category?.id ?? group?.id ?? '')
  const CurrentIcon = currentIcon.icon

  return (
    <HfSheet variant="settings" device={device} opened onClose={onClose} desktopSize={380}>
      <div className="mb-set-sheet-head">
        <h2 className="mb-set-sheet-title">{title}</h2>
        <HfButton className="mb-set-icon-btn" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </HfButton>
      </div>
      <div className="mb-set-sheet-body">
        <label className="mb-set-field">
          <span className="mb-set-label">名称</span>
          <input
            className="mb-set-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              editor.kind === 'account'
                ? '如「招商储蓄卡」'
                : editor.kind === 'accountGroup'
                  ? '如「短期现金」'
                  : '如「餐饮」'
            }
          />
        </label>

        {(editor.kind === 'category' || editor.kind === 'accountGroup') && (
          <div className="mb-set-field">
            <span className="mb-set-label">图标</span>
            {/* 图标网格收在独立抽屉里：这里只留当前图标与入口。 */}
            <HfButton
              className="mb-set-icon-current"
              aria-label="选择图标"
              onClick={() => setIconPickerOpen(true)}
            >
              <span className="mb-set-icon-current-mark" aria-hidden="true">
                <CurrentIcon size={18} strokeWidth={1.8} />
              </span>
              <span className="mb-set-icon-current-text">
                {iconKey ? '已选图标' : '自动（按名称匹配）'}
              </span>
              <ChevronRight size={16} />
            </HfButton>
            <p className="mb-set-hint">
              图标会显示在流水与分类详情中；选「自动」时按分类名称匹配，匹配不到则使用通用标签。
            </p>
          </div>
        )}

        {editor.kind === 'accountGroup' && (
          <>
            <div className="mb-set-field">
              <span className="mb-set-label">归属</span>
              <div className="mb-set-static">
                {editor.type === 'liability' ? '负债账户分组' : '资产账户分组'}
              </div>
            </div>
            <p className="mb-set-hint">
              分组即后端的账户分类，只有「一级分类 → 账户」两层。新建分组默认不带「现金等价 / 投资」标记，账户移入后按该分组的标记参与现金流与投资占比计算。
            </p>
            {duplicateGroup.length > 0 && (
              <p className="mb-set-hint is-warning">
                已存在同名分组「{duplicateGroup[0].name}」（#
                {duplicateGroup[0].id.slice(-4)}），保存后将并存并按尾号区分。
              </p>
            )}
            {editor.mode === 'edit' && (
              <p className="mb-set-hint">
                该分组下现有 {editedGroupAccountCount} 个账户。有账户引用时后端会拒绝删除。
              </p>
            )}
          </>
        )}

        {editor.kind === 'account' && (
          <>
            {groupMode ? (
              <label className="mb-set-field">
                <span className="mb-set-label">账户分组</span>
                <select
                  className="mb-set-input"
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                >
                  <option value="">{editor.mode === 'create' ? '请选择分组' : '未分组'}</option>
                  {groupOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.type === 'liability' ? '负债' : '资产'} · {groupOptionLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="mb-set-field">
                <span className="mb-set-label">账户性质</span>
                <div className="mb-set-kind-grid" role="group" aria-label="账户性质">
                  {(['deposit', 'cash', 'investment', 'credit'] as AccountKind[]).map((value) => (
                    <HfButton
                      key={value}
                      className={kind === value ? 'mb-set-kind is-active' : 'mb-set-kind'}
                      aria-pressed={kind === value}
                      onClick={() => setKind(value)}
                    >
                      {ACCOUNT_KIND_LABEL[value]}
                    </HfButton>
                  ))}
                </div>
              </div>
            )}
            {groupMode && groupId && (
              <p className="mb-set-hint">
                {(() => {
                  const selected = groupOptions.find((item) => item.id === groupId)
                  return selected
                    ? `将计入${selected.type === 'liability' ? '负债' : '资产'}；余额按账户本身计算。`
                    : null
                })()}
              </p>
            )}
            {flagChanged && (
              <p className="mb-set-hint is-warning">
                该分组与账户原分类的「现金等价 / 投资」标识不同；保存后现金流与投资占比会按新标识重算，净资产与资产构成不受影响。
              </p>
            )}
            <label className="mb-set-field">
              <span className="mb-set-label">期初余额（元）</span>
              <input
                className="mb-set-input"
                inputMode="decimal"
                value={initialBalance}
                onChange={(event) => setInitialBalance(event.target.value)}
                placeholder="0.00"
                disabled={hasTransactions}
              />
            </label>
            <label className="mb-set-field">
              <span className="mb-set-label">期初余额日期</span>
              <input
                className="mb-set-input"
                type="date"
                value={initialBalanceDate}
                onChange={(event) => setInitialBalanceDate(event.target.value)}
                disabled={hasTransactions}
              />
            </label>
            <p className="mb-set-hint">
              {hasTransactions
                ? '该账户已有流水，期初余额已冻结。要修正余额请改「当前余额」，系统会生成一条可见的平账记录。'
                : '期初余额 = 期初日期当天开始前的余额，当天交易照常计入。负债账户填负值（如信用卡欠款 ¥5,000 填 -5000）。'}
            </p>
            {editor.mode === 'edit' && (
              <label className="mb-set-field">
                <span className="mb-set-label">当前余额（元）</span>
                <input
                  className="mb-set-input"
                  inputMode="decimal"
                  value={balance}
                  onChange={(event) => setBalance(event.target.value)}
                  placeholder="0.00"
                />
              </label>
            )}
            {editor.mode === 'edit' && (
              <p className="mb-set-hint">
                {hasTransactions
                  ? '改「当前余额」不会改动期初，而是按差额自动生成一条平账记录（不计入收支与预算）。'
                  : '账户尚无流水，当前余额与期初余额等价。'}
              </p>
            )}
            {editor.mode === 'edit' && (
              <p className="mb-set-hint">
                账户顺序在账户列表中拖拽调整。
              </p>
            )}
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

        {error && <p className="mb-tx-form-error" role="alert">{error}</p>}
      </div>

      <div className="mb-set-sheet-actions">
        {onDelete && (
          <HfButton
            className="mb-set-btn is-danger"
            disabled={saving}
            onClick={onDelete}
          >
            <Trash2 size={15} />
            {editor.kind === 'accountGroup' ? '删除分组' : '删除账户'}
          </HfButton>
        )}
        <HfButton className="mb-set-btn is-ghost" onClick={onClose}>
          取消
        </HfButton>
        <HfButton
          className="mb-set-btn is-primary"
          disabled={!valid || saving}
          onClick={handleSave}
        >
          {saving ? '保存中…' : '保存'}
        </HfButton>
      </div>

      <IconPickerSheet
        opened={iconPickerOpen}
        device={device}
        value={iconKey}
        recommendedGroup={recommendedGroup}
        onSelect={setIconKey}
        onClose={() => setIconPickerOpen(false)}
      />
    </HfSheet>
  )
}
