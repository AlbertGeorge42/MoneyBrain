import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button, Drawer, Modal, TextInput } from '@mantine/core'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { minor } from '@domain/index'
import type { DeviceMode } from '@/features/shared/types'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import { formatCurrency } from '@/utils/format'
import type { Ledger, LedgerAccount, NewTransactionInput, TxType } from './model'
import { accountKindLabel, TODAY } from './model'
import { formatAmountInput, normalizeAmountInput, toCents } from './amountInput'
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
  const portalTarget =
    typeof document === 'undefined'
      ? null
      : (document.querySelector(device === 'mobile' ? '.mb-hf-phone' : '.mb-hf-root') as HTMLElement | null)

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position={device === 'mobile' ? 'bottom' : 'right'}
      size={device === 'mobile' ? 'auto' : 380}
      withinPortal
      portalProps={portalTarget ? { target: portalTarget } : undefined}
      zIndex={300}
      title={<span className="mb-overlay-title">{title}</span>}
      classNames={{
        content: device === 'mobile' ? 'mb-entry-picker-sheet' : 'mb-entry-picker-panel',
        header: 'mb-overlay-head',
        title: 'mb-overlay-title-wrap',
        body: device === 'mobile' ? 'mb-overlay-body' : 'mb-entry-picker-body',
        overlay: 'mb-overlay',
        close: 'mb-overlay-close',
      }}
    >
      <div className="mb-entry-picker">
        <TextInput
          aria-label="搜索账户"
          placeholder="搜索账户"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          leftSection={<Search size={16} />}
          classNames={{ input: 'mb-input' }}
        />
        {matched.length === 0 ? (
          <p className="mb-entry-picker-empty">没有匹配的账户</p>
        ) : (
          kinds.map((kind) => (
            <div key={kind} className="mb-entry-picker-group">
              <div className="mb-entry-picker-label">{accountKindLabel(kind)}</div>
              {matched
                .filter((account) => account.kind === kind)
                .map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className="mb-entry-picker-item"
                    aria-pressed={account.id === selectedId}
                    onClick={() => onSelect(account.id)}
                  >
                    <span className="mb-entry-picker-name">{accountDisplayName(account, accounts)}</span>
                    <span className="mb-entry-picker-meta">{formatCurrency(minor(account.balance))}</span>
                  </button>
                ))}
            </div>
          ))
        )}
      </div>
    </Drawer>
  )
}

function Keypad({ onKey }: { onKey: (key: string) => void }) {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫']
  return (
    <div className="mb-entry-keypad" role="group" aria-label="数字键盘">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          className="mb-entry-key"
          aria-label={key === '⌫' ? '退格' : key}
          onClick={() => onKey(key)}
        >
          {key}
        </button>
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
      const body = more?.closest('.mb-overlay-body') as HTMLElement | null
      if (!more || !body) return
      const foot = body.querySelector('.mb-entry-mobile-foot') as HTMLElement | null
      const limit = (foot?.getBoundingClientRect().top ?? body.getBoundingClientRect().bottom) - 8
      const overflow = more.getBoundingClientRect().bottom - limit
      if (overflow > 0) body.scrollTop += overflow
    })
    return () => cancelAnimationFrame(frame)
  }, [moreOpen, mobile])

  useEffect(() => {
    if (!mobile) amountRef.current?.focus()
  }, [mobile])

  const cents = toCents(amount)
  const feeCents = toCents(fee)
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
    <div className="mb-entry-form">
      <div className="mb-entry-types" role="group" aria-label="记账类型">
        {ENTRY_TYPES.map((item) => (
          <button
            key={item.value}
            type="button"
            className={item.value === type ? 'mb-entry-type is-active' : 'mb-entry-type'}
            aria-pressed={item.value === type}
            onClick={() => changeType(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {missingAccount && (
        <div className="mb-entry-missing-account" role="status">
          <p>还没有账户，记账前需要先添加一个账户。</p>
          <button type="button" className="mb-entry-missing-account-action" onClick={onCreateAccount}>
            去设置添加账户
          </button>
        </div>
      )}

      {mobile ? (
        <div className="mb-entry-amount-display" role="textbox" aria-label="金额" aria-readonly="true">
          <span className="mb-entry-currency">¥</span>
          <span className={cents === null && amount ? 'mb-entry-amount is-invalid' : 'mb-entry-amount'}>
            {amount || '0.00'}
          </span>
          {type === 'adjustment' && (
            <button
              type="button"
              className={adjustSign === -1 ? 'mb-entry-sign is-negative' : 'mb-entry-sign'}
              onClick={() => setAdjustSign((current) => (current === 1 ? -1 : 1))}
            >
              {adjustSign === 1 ? '调增' : '调减'}
            </button>
          )}
        </div>
      ) : (
        <div className={cents === null && amount.trim() !== '' ? 'mb-entry-amount-row is-invalid' : 'mb-entry-amount-row'}>
          <span className="mb-entry-currency" aria-hidden="true">¥</span>
          <input
            ref={amountRef}
            className="mb-entry-amount-input"
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
                gridRef.current?.querySelector<HTMLButtonElement>('.mb-entry-cat')?.focus()
              }
            }}
          />
          {type === 'adjustment' && (
            <button
              type="button"
              className={adjustSign === -1 ? 'mb-entry-sign is-negative' : 'mb-entry-sign'}
              onClick={() => setAdjustSign((current) => (current === 1 ? -1 : 1))}
            >
              {adjustSign === 1 ? '调增' : '调减'}
            </button>
          )}
          {cents === null && amount.trim() !== '' && (
            <span className="mb-entry-error">金额格式有误</span>
          )}
        </div>
      )}

      {type === 'transfer' || missingAccount ? null : (
        <fieldset className="mb-entry-field">
          <legend className="mb-field-label">分类</legend>
          <div
            ref={gridRef}
            className="mb-entry-grid"
            role="group"
            aria-label="分类"
            tabIndex={stage === 'category' ? 0 : -1}
            onKeyDown={handleGridKey}
          >
            {categories.map((category, index) => (
              <button
                key={category.id}
                type="button"
                className={category.id === categoryId ? 'mb-entry-cat is-active' : 'mb-entry-cat'}
                aria-pressed={category.id === categoryId}
                onClick={() => setCategoryId(category.id)}
              >
                <span className="mb-entry-cat-name">{category.name}</span>
                {!mobile && <span className="mb-entry-cat-hint">{index + 1}</span>}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {missingAccount ? null : type === 'transfer' ? (
        <>
          <fieldset className="mb-entry-field">
            <legend className="mb-field-label">转出账户</legend>
            <div className="mb-entry-accounts">
              <div className="mb-entry-accounts-scroll">
                {chips.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className="mb-entry-account"
                    aria-pressed={account.id === accountId}
                    onClick={() => rememberAccount(account.id, 'from')}
                  >
                    {accountDisplayName(account, ledger.accounts)}
                  </button>
                ))}
              </div>
              <button type="button" className="mb-entry-all" onClick={() => setPicker('from')}>
                全部账户 <ChevronRight size={14} />
              </button>
            </div>
          </fieldset>
          <fieldset className="mb-entry-field">
            <legend className="mb-field-label">转入账户</legend>
            <div className="mb-entry-accounts">
              <div className="mb-entry-accounts-scroll">
                {toChips.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className={account.id === toAccountId ? 'mb-entry-account is-active' : 'mb-entry-account'}
                    aria-pressed={account.id === toAccountId}
                    disabled={account.id === accountId}
                    onClick={() => rememberAccount(account.id, 'to')}
                  >
                    {accountDisplayName(account, ledger.accounts)}
                  </button>
                ))}
              </div>
              <button type="button" className="mb-entry-all" onClick={() => setPicker('to')}>
                全部账户 <ChevronRight size={14} />
              </button>
            </div>
          </fieldset>
        </>
      ) : (
        <fieldset className="mb-entry-field">
          <legend className="mb-field-label">账户</legend>
          <div className="mb-entry-accounts">
            <div className="mb-entry-accounts-scroll">
              {chips.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className="mb-entry-account"
                  aria-pressed={account.id === accountId}
                  onClick={() => rememberAccount(account.id, 'from')}
                >
                  {account.name}
                </button>
              ))}
            </div>
            <button type="button" className="mb-entry-all" onClick={() => setPicker('from')}>
              全部账户 <ChevronRight size={14} />
            </button>
          </div>
        </fieldset>
      )}

      <button
        type="button"
        className="mb-entry-more-toggle"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((current) => !current)}
      >
        {moreOpen ? '收起更多' : '日期 / 备注 / 手续费'}
        <ChevronDown size={16} className={moreOpen ? 'is-open' : undefined} />
      </button>

      {moreOpen && (
        <div className="mb-entry-more" ref={moreRef}>
          <label className="mb-entry-more-field">
            <span className="mb-field-label">日期</span>
            <input
              type="date"
              className="mb-input mb-entry-date"
              value={date}
              onChange={(event) => setDate(event.currentTarget.value)}
            />
          </label>
          <label className="mb-entry-more-field">
            <span className="mb-field-label">备注</span>
            <TextInput
              placeholder="例如：公司楼下午餐"
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              classNames={{ input: 'mb-input' }}
            />
          </label>
          {type === 'transfer' && (
            <label className="mb-entry-more-field">
              <span className="mb-field-label">手续费</span>
              <TextInput
                placeholder="0.00"
                inputMode="decimal"
                value={fee}
                onChange={(event) => setFee(event.currentTarget.value)}
                leftSection={<span className="mb-entry-currency">¥</span>}
                classNames={{ input: 'mb-input' }}
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
        <div className="mb-entry-mobile-foot">
          <Keypad onKey={appendKey} />
          <div className="mb-entry-mobile-actions">
            <Button variant="default" className="mb-secondary-btn" onClick={onRequestClose} disabled={saving}>
              取消
            </Button>
            <Button
              variant="default"
              className="mb-secondary-btn"
              disabled={!canSave || saving}
              onClick={() => void commit(false)}
            >
              {savingMode === 'save' ? '保存中…' : '保存'}
            </Button>
            <Button className="mb-primary-btn mb-entry-continue" disabled={!canSave || saving} onClick={() => void commit(true)}>
              {savingMode === 'continue' ? '保存中…' : '保存并再记'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-entry-actions">
          <Button variant="default" className="mb-secondary-btn" onClick={onRequestClose} disabled={saving}>
            取消
          </Button>
          <Button className="mb-primary-btn" disabled={!canSave || saving} onClick={() => void commit(true)}>
            {savingMode === 'continue' ? '保存中…' : '保存并再记'} <kbd className="mb-kbd">⏎</kbd>
          </Button>
          <Button className="mb-primary-btn" disabled={!canSave || saving} onClick={() => void commit(false)}>
            {savingMode === 'save' ? '保存中…' : '保存'}
          </Button>
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
    <span className="mb-entry-head">
      <span className="mb-overlay-title-copy">
        <span className="mb-overlay-title">记一笔</span>
      </span>
      {device === 'mobile' && (
        <span className="mb-entry-count">
          <span>已连记 {savedCount} 笔</span>
          <span>第 {savedCount + 1} 笔</span>
        </span>
      )}
    </span>
  )

  const overlayClass =
    device === 'mobile'
      ? {
          content: 'mb-sheet mb-entry-sheet',
          header: 'mb-overlay-head',
          title: 'mb-overlay-title-wrap',
          body: 'mb-overlay-body',
          overlay: 'mb-overlay',
          close: 'mb-overlay-close',
        }
      : {
          content: 'mb-modal',
          header: 'mb-overlay-head',
          title: 'mb-overlay-title-wrap',
          body: 'mb-overlay-body',
          overlay: 'mb-overlay',
          close: 'mb-overlay-close',
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
        <Drawer
          opened={opened}
          onClose={onClose}
          position="bottom"
          size="auto"
          withinPortal={false}
          title={title}
          classNames={overlayClass}
        >
          {form}
        </Drawer>
      ) : (
        <Modal
          opened={opened}
          onClose={onClose}
          centered
          size="auto"
          withinPortal={false}
          title={title}
          classNames={overlayClass}
        >
          {form}
        </Modal>
      )}
    </div>
  )
}
