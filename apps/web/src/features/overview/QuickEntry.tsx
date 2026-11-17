import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button as MantineButton, Modal, TextInput } from '@mantine/core'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { minor } from '@domain/index'
import { Button } from '@/features/shared/Button'
import { FieldLabel } from '@/features/shared/FieldLabel'
import { Segmented } from '@/features/shared/Segmented'
import { Sheet } from '@/features/shared/Sheet'
import type { DeviceMode } from '@/features/shared/types'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import { formatCurrency } from '@/utils/format'
import type { Ledger, LedgerAccount, NewTransactionInput, TxType } from './model'
import { accountKindLabel, TODAY } from './model'
import { formatAmountInput, normalizeAmountInput, parseMoneyInput } from '@/utils/money'
import { useLedger, type LedgerMutationOutcome } from './ledgerStore'
import './overlays.css'

const ENTRY_TYPES: readonly { value: TxType; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
  { value: 'refund', label: '退款' },
  { value: 'adjustment', label: '调整' },
]

const CATEGORY_TYPE: Record<TxType, TxType> = {
  expense: 'expense',
  income: 'income',
  transfer: 'transfer',
  refund: 'refund',
  adjustment: 'expense',
}

const DEFAULT_CATEGORY: Record<TxType, string> = {
  expense: 'food',
  income: 'salary',
  transfer: 'move',
  refund: 'refund',
  adjustment: 'other',
}

const MAX_AMOUNT_DIGITS = 9

function categoryOptions(categories: Ledger['categories'], type: TxType) {
  if (type === 'transfer') return []
  const roots = categories.filter((category) => !category.parentId)
  if (type === 'refund') {
    return [
      ...roots.filter((category) => category.type === 'refund'),
      ...roots.filter((category) => category.type === 'expense'),
    ]
  }
  const target = CATEGORY_TYPE[type]
  return roots.filter((category) => category.type === target)
}

/** 常用账户 chips：最近使用 + 当前选中，最多 5 个，选中项恒可见。 */
function accountChips(accounts: LedgerAccount[], recent: readonly string[], selected: string) {
  const ids = [selected, ...recent.filter((id) => id !== selected)]
  const unique = [...new Set(ids)]
  const chips = unique
    .map((id) => accounts.find((account) => account.id === id))
    .filter((account): account is LedgerAccount => Boolean(account))
  if (chips.length < 5) {
    for (const account of accounts) {
      if (chips.length >= 5) break
      if (!chips.some((item) => item.id === account.id)) chips.push(account)
    }
  }
  return chips
}

function AccountPicker({
  opened,
  device,
  accounts,
  selectedId,
  title,
  onSelect,
  onClose,
}: {
  opened: boolean
  device: DeviceMode
  accounts: LedgerAccount[]
  selectedId: string
  title: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (opened) setQuery('')
  }, [opened])

  const matched = accounts.filter((account) => account.name.includes(query.trim()))
  const kinds = [...new Set(matched.map((account) => account.kind))]
  // 记账弹层自身带 transform，Drawer 若留在原地会以弹层为包含块（桌面变成居中面板）。
  // 预览壳里把二级抽屉重新挂到 root / 手机框，恢复「桌面贴右缘、移动贴手机底部」。
  return (
    <Sheet
      variant="entryPicker"
      device={device}
      opened={opened}
      onClose={onClose}
      zIndex={300}
      portal
      title={<span className="mb-ov-overlay-title">{title}</span>}
    >
      <div className="mb-ov-picker">
        <TextInput
          aria-label="搜索账户"
          placeholder="搜索账户"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          leftSection={<Search size={16} />}
          classNames={{ input: 'mb-shared-input' }}
        />
        {matched.length === 0 ? (
          <p className="mb-ov-picker-empty">没有匹配的账户</p>
        ) : (
          kinds.map((kind) => (
            <div key={kind} className="mb-ov-picker-group">
              <div className="mb-ov-picker-label">{accountKindLabel(kind)}</div>
              {matched
                .filter((account) => account.kind === kind)
                .map((account) => (
                  <Button
                    key={account.id}
                    className="mb-ov-picker-item"
                    aria-pressed={account.id === selectedId}
                    onClick={() => onSelect(account.id)}
                  >
                    <span className="mb-ov-picker-name">{accountDisplayName(account, accounts)}</span>
                    <span className="mb-ov-picker-meta">{formatCurrency(minor(account.balance))}</span>
                  </Button>
                ))}
            </div>
          ))
        )}
      </div>
    </Sheet>
  )
}

function Keypad({ onKey }: { onKey: (key: string) => void }) {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫']
  return (
    <div className="mb-ov-keypad" role="group" aria-label="数字键盘">
      {keys.map((key) => (
        <Button
          key={key}
          className="mb-ov-key"
          aria-label={key === '⌫' ? '退格' : key}
          onClick={() => onKey(key)}
        >
          {key}
        </Button>
      ))}
    </div>
  )
}

function EntryForm({
  ledger,
  device,
  onRequestClose,
  onCreateAccount,
  onSave,
}: {
  ledger: Ledger
  device: DeviceMode
  onRequestClose: () => void
  onCreateAccount: () => void
  onSave: (input: NewTransactionInput, keepOpen: boolean) => Promise<LedgerMutationOutcome>
}) {
  const mobile = device === 'mobile'
  // 空账本没有账户/分类：保存按钮禁用时必须说明原因，并给出可执行的下一步。
  const missingAccount = ledger.accounts.length === 0
  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY.expense)
  const [accountId, setAccountId] = useState(ledger.accounts[0]?.id || '')
  const [toAccountId, setToAccountId] = useState(ledger.accounts[1]?.id || '')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(ledger.snapshot?.today ?? TODAY)
  const [fee, setFee] = useState('')
  const [excluded, setExcluded] = useState(false)
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1)
  const [moreOpen, setMoreOpen] = useState(false)
  const [picker, setPicker] = useState<'from' | 'to' | null>(null)
  const [recent, setRecent] = useState<string[]>(ledger.accounts.slice(0, 5).map((item) => item.id))
  const [stage, setStage] = useState<'amount' | 'category'>('amount')
  const [saving, setSaving] = useState(false)
  const [savingMode, setSavingMode] = useState<'save' | 'continue' | null>(null)
  const [saveError, setSaveError] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const moreRef = useRef<HTMLDivElement>(null)

  // 展开「更多」后把日期 / 备注滚到吸底键盘上方，否则字段正好被键盘盖住。
  useEffect(() => {
    if (!mobile || !moreOpen) return
    const frame = requestAnimationFrame(() => {
      const more = moreRef.current
      const body = more?.closest('.mb-ov-body') as HTMLElement | null
      if (!more || !body) return
      const foot = body.querySelector('.mb-ov-mobile-foot') as HTMLElement | null
      const limit = (foot?.getBoundingClientRect().top ?? body.getBoundingClientRect().bottom) - 8
      const overflow = more.getBoundingClientRect().bottom - limit
      if (overflow > 0) body.scrollTop += overflow
    })
    return () => cancelAnimationFrame(frame)
  }, [moreOpen, mobile])

  useEffect(() => {
    if (!mobile) amountRef.current?.focus()
  }, [mobile])

  const cents = parseMoneyInput(amount)
  const feeCents = parseMoneyInput(fee)
  const categories = categoryOptions(ledger.categories, type)
  const chips = accountChips(ledger.accounts, recent, accountId)
  const toChips = accountChips(ledger.accounts, recent, toAccountId)

  const rememberAccount = (id: string, target: 'from' | 'to') => {
    setRecent((current) => [id, ...current.filter((item) => item !== id)].slice(0, 5))
    if (target === 'to') setToAccountId(id)
    else setAccountId(id)
    setPicker(null)
  }

  const changeType = (next: TxType) => {
    setType(next)
    setCategoryId(DEFAULT_CATEGORY[next])
    setStage('amount')
    if (!mobile) amountRef.current?.focus()
    if (next !== 'transfer') {
      setPicker(null)
      setFee('')
    }
    if (next !== 'adjustment') setAdjustSign(1)
    // 转账 / 调整本就不进收支统计，标记无意义，切换类型时清掉。
    if (next === 'transfer' || next === 'adjustment') setExcluded(false)
  }

  const appendKey = (key: string) => {
    if (key === '⌫') {
      setAmount((current) => current.slice(0, -1))
      return
    }
    setAmount((current) => {
      if (key === '.' && current.includes('.')) return current
      if (current.includes('.') && current.split('.')[1]?.length >= 2) return current
      const digits = current.replace('.', '').length
      if (digits >= MAX_AMOUNT_DIGITS) return current
      return current + key
    })
  }

  const canSave =
    cents !== null &&
    Boolean(ledger.accounts.find((account) => account.id === accountId)) &&
    (type !== 'transfer' || (Boolean(toAccountId) && toAccountId !== accountId))

  const commit = async (keepOpen: boolean) => {
    // 同步闸门：双击 / 按住 Enter 时第二次调用必须被挡住，不能只依赖 saving 的异步渲染。
    if (!canSave || cents === null || busyRef.current) return
    busyRef.current = true
    const mode = keepOpen ? 'continue' : 'save'
    const signed = type === 'adjustment' ? cents * adjustSign : cents
    const input: NewTransactionInput = {
      type,
      categoryId: type === 'transfer' ? 'move' : categoryId,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      amount: signed,
      note,
      date,
      fee: type === 'transfer' ? feeCents ?? 0 : 0,
      excludeFromIncomeExpense:
        type !== 'transfer' && type !== 'adjustment' ? excluded : undefined,
    }
    setSaving(true)
    setSavingMode(mode)
    setSaveError('')
    try {
      const result = await onSave(input, keepOpen)
      // 写失败时保留输入与弹层，错误就地回显，用户可以直接重试。
      if (!result.ok) {
        setSaveError(result.error ?? '保存失败，请重试')
        return
      }
      setAmount('')
      setNote('')
      setFee('')
      setStage('amount')
      if (!mobile) amountRef.current?.focus()
    } catch {
      setSaveError('保存失败，请重试')
    } finally {
      busyRef.current = false
      setSaving(false)
      setSavingMode(null)
    }
  }

  const handleGridKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void commit(true)
      return
    }
    const index = Number(event.key)
    if (index >= 1 && index <= 9 && categories[index - 1]) {
      event.preventDefault()
      setCategoryId(categories[index - 1].id)
    }
  }

  return (
    <div className="mb-ov-form">
      <Segmented
        tone="solid"
        fill
        label="记账类型"
        value={type}
        options={ENTRY_TYPES.map((item) => ({ id: item.value, label: item.label }))}
        onChange={changeType}
      />

      {missingAccount && (
        <div className="mb-ov-missing-account" role="status">
          <p>还没有账户，记账前需要先添加一个账户。</p>
          <Button className="mb-ov-missing-account-action" onClick={onCreateAccount}>
            去设置添加账户
          </Button>
        </div>
      )}

      {mobile ? (
        <div className="mb-ov-amount-display" role="textbox" aria-label="金额" aria-readonly="true">
          <span className="mb-ov-currency">¥</span>
          <span className={cents === null && amount ? 'mb-ov-entry-amount is-invalid' : 'mb-ov-entry-amount'}>
            {amount || '0.00'}
          </span>
          {type === 'adjustment' && (
            <Button
              className={adjustSign === -1 ? 'mb-ov-sign mb-ov-sign--negative' : 'mb-ov-sign'}
              onClick={() => setAdjustSign((current) => (current === 1 ? -1 : 1))}
            >
              {adjustSign === 1 ? '调增' : '调减'}
            </Button>
          )}
        </div>
      ) : (
        <div className={cents === null && amount.trim() !== '' ? 'mb-ov-amount-row is-invalid' : 'mb-ov-amount-row'}>
          <span className="mb-ov-currency" aria-hidden="true">¥</span>
          <input
            ref={amountRef}
            className="mb-ov-amount-input"
            aria-label="金额"
            aria-invalid={cents === null && amount.trim() !== ''}
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(normalizeAmountInput(event.currentTarget.value))}
            onFocus={(event) => setAmount(normalizeAmountInput(event.currentTarget.value))}
            onBlur={(event) => setAmount(formatAmountInput(event.currentTarget.value))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                setStage('category')
                gridRef.current?.querySelector<HTMLButtonElement>('.mb-ov-cat')?.focus()
              }
            }}
          />
          {type === 'adjustment' && (
            <Button
              className={adjustSign === -1 ? 'mb-ov-sign mb-ov-sign--negative' : 'mb-ov-sign'}
              onClick={() => setAdjustSign((current) => (current === 1 ? -1 : 1))}
            >
              {adjustSign === 1 ? '调增' : '调减'}
            </Button>
          )}
          {cents === null && amount.trim() !== '' && (
            <span className="mb-ov-error">金额格式有误</span>
          )}
        </div>
      )}

      {type === 'transfer' || missingAccount ? null : (
        <fieldset className="mb-ov-field">
          <FieldLabel as="legend">分类</FieldLabel>
          <div
            ref={gridRef}
            className="mb-ov-entry-grid"
            role="group"
            aria-label="分类"
            tabIndex={stage === 'category' ? 0 : -1}
            onKeyDown={handleGridKey}
          >
            {categories.map((category, index) => (
              <Button
                key={category.id}
                className={category.id === categoryId ? 'mb-ov-cat is-active' : 'mb-ov-cat'}
                aria-pressed={category.id === categoryId}
                onClick={() => setCategoryId(category.id)}
              >
                <span>{category.name}</span>
                {!mobile && <span className="mb-ov-cat-hint">{index + 1}</span>}
              </Button>
            ))}
          </div>
        </fieldset>
      )}

      {missingAccount ? null : type === 'transfer' ? (
        <>
          <fieldset className="mb-ov-field">
            <FieldLabel as="legend">转出账户</FieldLabel>
            <div className="mb-ov-accounts">
              <div className="mb-ov-accounts-scroll">
                {chips.map((account) => (
                  <Button
                    key={account.id}
                    className="mb-ov-account"
                    aria-pressed={account.id === accountId}
                    onClick={() => rememberAccount(account.id, 'from')}
                  >
                    {accountDisplayName(account, ledger.accounts)}
                  </Button>
                ))}
              </div>
              <Button className="mb-ov-all" onClick={() => setPicker('from')}>
                全部账户 <ChevronRight size={14} />
              </Button>
            </div>
          </fieldset>
          <fieldset className="mb-ov-field">
            <FieldLabel as="legend">转入账户</FieldLabel>
            <div className="mb-ov-accounts">
              <div className="mb-ov-accounts-scroll">
                {toChips.map((account) => (
                  <Button
                    key={account.id}
                    className={account.id === toAccountId ? 'mb-ov-account is-active' : 'mb-ov-account'}
                    aria-pressed={account.id === toAccountId}
                    disabled={account.id === accountId}
                    onClick={() => rememberAccount(account.id, 'to')}
                  >
                    {accountDisplayName(account, ledger.accounts)}
                  </Button>
                ))}
              </div>
              <Button className="mb-ov-all" onClick={() => setPicker('to')}>
                全部账户 <ChevronRight size={14} />
              </Button>
            </div>
          </fieldset>
        </>
      ) : (
        <fieldset className="mb-ov-field">
          <FieldLabel as="legend">账户</FieldLabel>
          <div className="mb-ov-accounts">
            <div className="mb-ov-accounts-scroll">
              {chips.map((account) => (
                <Button
                  key={account.id}
                  className="mb-ov-account"
                  aria-pressed={account.id === accountId}
                  onClick={() => rememberAccount(account.id, 'from')}
                >
                  {account.name}
                </Button>
              ))}
            </div>
            <Button className="mb-ov-all" onClick={() => setPicker('from')}>
              全部账户 <ChevronRight size={14} />
            </Button>
          </div>
        </fieldset>
      )}

      {!missingAccount && type !== 'transfer' && type !== 'adjustment' && (
        <label className="mb-ov-excluded">
          <input
            type="checkbox"
            className="mb-ov-excluded-input"
            checked={excluded}
            onChange={(event) => setExcluded(event.currentTarget.checked)}
          />
          <span className="mb-ov-excluded-copy">
            <span className="mb-ov-excluded-title">不计收支</span>
            <span className="mb-ov-excluded-hint">
              仍影响账户余额，但不进收入/支出统计与预算用量
            </span>
          </span>
        </label>
      )}

      <Button
        className="mb-ov-more-toggle"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((current) => !current)}
      >
        {moreOpen ? '收起更多' : '日期 / 备注 / 手续费'}
        <ChevronDown size={16} className={moreOpen ? 'is-open' : undefined} />
      </Button>

      {moreOpen && (
        <div className="mb-ov-more" ref={moreRef}>
          <label className="mb-ov-more-field">
            <FieldLabel>日期</FieldLabel>
            <input
              type="date"
              className="mb-shared-input mb-ov-date"
              value={date}
              onChange={(event) => setDate(event.currentTarget.value)}
            />
          </label>
          <label className="mb-ov-more-field">
            <FieldLabel>备注</FieldLabel>
            <TextInput
              placeholder="例如：公司楼下午餐"
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              classNames={{ input: 'mb-shared-input' }}
            />
          </label>
          {type === 'transfer' && (
            <label className="mb-ov-more-field">
              <FieldLabel>手续费</FieldLabel>
              <TextInput
                placeholder="0.00"
                inputMode="decimal"
                value={fee}
                onChange={(event) => setFee(event.currentTarget.value)}
                leftSection={<span className="mb-ov-currency">¥</span>}
                classNames={{ input: 'mb-shared-input' }}
              />
            </label>
          )}
        </div>
      )}

      {saveError && (
        <p className="mb-tx-form-error" role="alert">
          {saveError}
        </p>
      )}

      {mobile ? (
        <div className="mb-ov-mobile-foot">
          <Keypad onKey={appendKey} />
          <div className="mb-ov-mobile-actions">
            <MantineButton variant="default" className="mb-shared-btn--secondary" onClick={onRequestClose} disabled={saving}>
              取消
            </MantineButton>
            <MantineButton
              variant="default"
              className="mb-shared-btn--secondary"
              disabled={!canSave || saving}
              onClick={() => void commit(false)}
            >
              {savingMode === 'save' ? '保存中…' : '保存'}
            </MantineButton>
            <MantineButton className="mb-shared-btn--primary mb-ov-continue" disabled={!canSave || saving} onClick={() => void commit(true)}>
              {savingMode === 'continue' ? '保存中…' : '保存并再记'}
            </MantineButton>
          </div>
        </div>
      ) : (
        <div className="mb-ov-actions">
          <MantineButton variant="default" className="mb-shared-btn--secondary" onClick={onRequestClose} disabled={saving}>
            取消
          </MantineButton>
          <MantineButton className="mb-shared-btn--primary" disabled={!canSave || saving} onClick={() => void commit(true)}>
            {savingMode === 'continue' ? '保存中…' : '保存并再记'} <kbd className="mb-shell-kbd">⏎</kbd>
          </MantineButton>
          <MantineButton className="mb-shared-btn--primary" disabled={!canSave || saving} onClick={() => void commit(false)}>
            {savingMode === 'save' ? '保存中…' : '保存'}
          </MantineButton>
        </div>
      )}

      <AccountPicker
        opened={picker !== null}
        device={device}
        accounts={ledger.accounts}
        selectedId={picker === 'to' ? toAccountId : accountId}
        title={picker === 'to' ? '选择转入账户' : '选择账户'}
        onSelect={(id) => rememberAccount(id, picker === 'to' ? 'to' : 'from')}
        onClose={() => setPicker(null)}
      />
    </div>
  )
}

export function QuickEntry({
  opened,
  device,
  onClose,
  onSaved,
  onCreateAccount,
}: {
  opened: boolean
  device: DeviceMode
  onClose: () => void
  onSaved: (transactionId: string | null, undoToken?: string) => void
  /** 空账本时「去设置添加账户」的入口；未接时只保留说明文案。 */
  onCreateAccount?: () => void
}) {
  const { ledger, addTransaction } = useLedger()
  const [savedCount, setSavedCount] = useState(0)

  const handleSave = async (
    input: NewTransactionInput,
    keepOpen: boolean,
  ): Promise<LedgerMutationOutcome> => {
    const result = await addTransaction(input)
    if (!result.ok) return result
    setSavedCount((current) => current + 1)
    onSaved(result.id ?? null, result.undoToken)
    if (!keepOpen) onClose()
    return result
  }

  const title = (
    <span className="mb-ov-entry-head">
      <span className="mb-ov-title-copy">
        <span className="mb-ov-overlay-title">记一笔</span>
      </span>
      {device === 'mobile' && (
        <span className="mb-ov-count">
          <span>已连记 {savedCount} 笔</span>
          <span>第 {savedCount + 1} 笔</span>
        </span>
      )}
    </span>
  )

  const modalClass = {
    content: 'mb-shared-modal',
    header: 'mb-ov-overlay-head',
    title: 'mb-ov-title-wrap',
    body: 'mb-ov-body',
    overlay: 'mb-ov-overlay',
    close: 'mb-ov-close',
  }

  const form = (
    <EntryForm
      ledger={ledger}
      device={device}
      onRequestClose={onClose}
      onCreateAccount={onCreateAccount ?? onClose}
      onSave={handleSave}
    />
  )

  return (
    <div data-device={device}>
      {device === 'mobile' ? (
        <Sheet variant="entry" device={device} opened={opened} onClose={onClose} title={title}>
          {form}
        </Sheet>
      ) : (
        <Modal
          opened={opened}
          onClose={onClose}
          centered
          size="auto"
          withinPortal={false}
          title={title}
          classNames={modalClass}
        >
          {form}
        </Modal>
      )}
    </div>
  )
}
