import { useEffect, useState } from 'react'
import {
  Button,
  Collapse,
  Drawer,
  Modal,
  NumberInput,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { CategoryGlyph } from '../../ui/CategoryGlyph'
import { ACCOUNTS, CATEGORIES, PREVIEW_TODAY, findAccount, findCategory } from './mock'
import { TYPE_OPTIONS } from './transaction-utils'
import type { Account, Category, DeviceMode, Transaction, TxType } from './types'

type EntryFormValues = {
  type: TxType
  amount: string
  categoryId: string
  accountId: string
  toAccountId: string
  date: string
  note: string
  fee: string
  coupon: string
}

type EntryOverlayProps = {
  open: boolean
  device: DeviceMode
  accounts?: Account[]
  categories?: Category[]
  today?: string
  /** 生产环境隐藏暂无 API 对应能力的类型（如退款需关联原交易）。 */
  allowedTypes?: TxType[]
  /** 预览壳沿用固定默认账户；生产不传，取真实账户首个。 */
  defaultAccountId?: string
  defaultToAccountId?: string
  onClose: () => void
  onSaved: (tx: Transaction) => void | Promise<void>
}

let entrySequence = 0

function nextTransactionId(): string {
  entrySequence += 1
  return `hf-entry-${entrySequence}`
}

function firstCategoryFor(categories: Category[], type: TxType): string {
  return categories.find((category) => category.types.includes(type))?.id ?? categories[0]?.id ?? ''
}

const KEYPAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'] as const

export function EntryOverlay({
  open,
  device,
  accounts = ACCOUNTS,
  categories = CATEGORIES,
  today = PREVIEW_TODAY,
  allowedTypes,
  defaultAccountId,
  defaultToAccountId,
  onClose,
  onSaved,
}: EntryOverlayProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [saving, setSaving] = useState(false)

  const form = useForm<EntryFormValues>({
    initialValues: {
      type: 'expense',
      amount: '',
      categoryId: firstCategoryFor(categories, 'expense'),
      accountId: defaultAccountId ?? accounts[0]?.id ?? '',
      toAccountId: defaultToAccountId ?? accounts[1]?.id ?? accounts[0]?.id ?? '',
      date: today,
      note: '',
      fee: '',
      coupon: '',
    },
    validate: {
      amount: (value) => {
        if (!value.trim()) return '请输入金额'
        const num = Number(value)
        if (Number.isNaN(num) || num <= 0) return '金额需大于 0'
        return null
      },
    },
  })

  useEffect(() => {
    if (open) {
      form.setInitialValues(
        {
          type: 'expense',
          amount: '',
          categoryId: firstCategoryFor(categories, 'expense'),
          accountId: defaultAccountId ?? accounts[0]?.id ?? '',
          toAccountId: defaultToAccountId ?? accounts[1]?.id ?? accounts[0]?.id ?? '',
          date: today,
          note: '',
          fee: '',
          coupon: '',
        },
      )
      form.reset()
      setMoreOpen(false)
      setSavedCount(0)
      setSaving(false)
    }
    // 只在浮层打开时重置，输入过程中不重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const typeOptions = TYPE_OPTIONS.filter(
    (option) => option.value !== 'all' && (!allowedTypes || allowedTypes.includes(option.value as TxType)),
  )
  const categoryOptions = categories.filter((category) => category.types.includes(form.values.type))

  const selectType = (type: TxType) => {
    form.setFieldValue('type', type)
    if (!categories.some((category) => category.id === form.values.categoryId && category.types.includes(type))) {
      form.setFieldValue('categoryId', firstCategoryFor(categories, type))
    }
  }

  const selectCategory = (categoryId: string) => {
    form.setFieldValue('categoryId', categoryId)
  }

  const appendKey = (key: string) => {
    if (key === '⌫') {
      form.setFieldValue('amount', form.values.amount.slice(0, -1))
      return
    }
    if (key === '.' && form.values.amount.includes('.')) return
    const next = form.values.amount + key
    const [, decimals] = next.split('.')
    if (decimals && decimals.length > 2) return
    if (next.length > 1 && next.startsWith('0') && !next.startsWith('0.')) {
      form.setFieldValue('amount', next.slice(1))
      return
    }
    form.setFieldValue('amount', next)
  }

  const closeAndReset = () => {
    form.reset()
    setMoreOpen(false)
    setSavedCount(0)
    setSaving(false)
    onClose()
  }

  const commit = async (closeAfter: boolean) => {
    if (saving) return
    const result = form.validate()
    if (result.hasErrors) return

    const values = form.values
    const category = findCategory(categories, values.categoryId)
    const toAccount = findAccount(accounts, values.toAccountId)
    const signedAmount = values.type === 'income' || values.type === 'refund' ? Number(values.amount) : -Number(values.amount)

    const tx: Transaction = {
      id: nextTransactionId(),
      type: values.type,
      amount: signedAmount,
      categoryId: values.categoryId,
      subcategory: values.note.trim() || category?.name || '未命名',
      accountId: values.accountId,
      toAccountId: values.type === 'transfer' ? values.toAccountId : undefined,
      date: values.date || today,
      note: values.note.trim() || (values.type === 'transfer' ? `转入${toAccount?.name ?? '账户'}` : category?.name ?? ''),
      fee: values.fee.trim() ? Number(values.fee) : undefined,
      coupon: values.coupon.trim() ? Number(values.coupon) : undefined,
    }

    setSaving(true)
    try {
      await onSaved(tx)
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : '保存失败，请重试',
        autoClose: 4000,
      })
      return
    } finally {
      setSaving(false)
    }

    if (closeAfter) {
      notifications.show({ message: '已记一笔', autoClose: 3000 })
      closeAndReset()
      return
    }

    const nextCount = savedCount + 1
    setSavedCount(nextCount)
    if (device === 'pc') {
      notifications.show({ message: `第 ${nextCount} 笔已入账`, autoClose: 2400 })
    }
    form.setFieldValue('amount', '')
    form.setFieldValue('note', '')
    form.setFieldValue('fee', '')
    form.setFieldValue('coupon', '')
    form.clearErrors()
  }

  const body = (
    <div className="hf-entry">
      {device === 'mobile' && (
        <div className="hf-entry-progress">
          <span className="mb-text-1">已连记 {savedCount} 笔</span>
          <span className="mb-text-0">第 {savedCount + 1} 笔 · 合计 {form.values.amount ? `¥${form.values.amount}` : '¥0.00'}</span>
        </div>
      )}

      <div className="hf-entry-types" role="group" aria-label="交易类型">
        {typeOptions.map((option) => (
          <UnstyledButton
            key={option.value}
            className="mb-chip hf-entry-type"
            data-active={form.values.type === option.value}
            aria-pressed={form.values.type === option.value}
            onClick={() => selectType(option.value as TxType)}
          >
            {option.label}
          </UnstyledButton>
        ))}
      </div>

      {device === 'pc' ? (
        <label className="hf-entry-amount-wrap">
          <span className="hf-entry-currency" aria-hidden>¥</span>
          <TextInput
            autoFocus
            className="hf-entry-amount"
            placeholder="0.00"
            aria-label="金额"
            inputMode="decimal"
            variant="unstyled"
            value={form.values.amount}
            onChange={(event) => form.setFieldValue('amount', event.currentTarget.value.replace(/[^0-9.]/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit(false)
              }
            }}
          />
        </label>
      ) : (
        <div className="hf-entry-amount-display mb-num" role="textbox" aria-readonly aria-label="金额">
          <span aria-hidden>¥</span> {form.values.amount || '0.00'}
        </div>
      )}
      {form.errors.amount && <div className="hf-entry-error" role="alert">{form.errors.amount}</div>}

      <div className="hf-entry-grid" role="group" aria-label="分类">
        {categoryOptions.slice(0, 9).map((category, index) => (
          <UnstyledButton
            key={category.id}
            className="hf-entry-category"
            data-active={form.values.categoryId === category.id}
            aria-pressed={form.values.categoryId === category.id}
            onClick={() => selectCategory(category.id)}
          >
            <span className="hf-entry-category-hint" aria-hidden>{index + 1}</span>
            <CategoryGlyph icon={category.icon} colorIndex={category.colorIndex} compact />
            <span className="hf-entry-category-name">{category.name}</span>
            {form.values.categoryId === category.id && <Check className="hf-entry-check" aria-hidden />}
          </UnstyledButton>
        ))}
      </div>

      <div className="hf-entry-accounts">
        {form.values.type === 'transfer' ? (
          <>
            <div className="hf-entry-account-row">
              <span className="hf-entry-account-label">转出</span>
              {accounts.map((account) => (
                <UnstyledButton
                  key={account.id}
                  className="mb-chip hf-account-chip"
                  data-active={form.values.accountId === account.id}
                  aria-pressed={form.values.accountId === account.id}
                  onClick={() => form.setFieldValue('accountId', account.id)}
                >
                  {account.name}
                </UnstyledButton>
              ))}
            </div>
            <div className="hf-entry-account-row">
              <span className="hf-entry-account-label">转入</span>
              {accounts.filter((account) => account.id !== form.values.accountId).map((account) => (
                <UnstyledButton
                  key={account.id}
                  className="mb-chip hf-account-chip"
                  data-active={form.values.toAccountId === account.id}
                  aria-pressed={form.values.toAccountId === account.id}
                  onClick={() => form.setFieldValue('toAccountId', account.id)}
                >
                  {account.name}
                </UnstyledButton>
              ))}
            </div>
          </>
        ) : (
          <div className="hf-entry-account-row">
            {accounts.map((account) => (
              <UnstyledButton
                key={account.id}
                className="mb-chip hf-account-chip"
                data-active={form.values.accountId === account.id}
                aria-pressed={form.values.accountId === account.id}
                onClick={() => form.setFieldValue('accountId', account.id)}
              >
                {account.name}
                {account.lastUsed && <span className="hf-account-recent">上次</span>}
              </UnstyledButton>
            ))}
          </div>
        )}
      </div>

      <UnstyledButton
        className="hf-entry-more"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((value) => !value)}
      >
        <span>手续费 / 优惠券 / 日期 / 备注</span>
        <ChevronDown className="hf-entry-more-icon" data-open={moreOpen} aria-hidden />
      </UnstyledButton>

      <Collapse in={moreOpen}>
        <div className="hf-entry-more-fields">
          <NumberInput
            label="手续费"
            placeholder="0.00"
            min={0}
            hideControls
            value={form.values.fee}
            onChange={(value) => form.setFieldValue('fee', String(value ?? ''))}
          />
          <NumberInput
            label="优惠券"
            placeholder="0.00"
            min={0}
            hideControls
            value={form.values.coupon}
            onChange={(value) => form.setFieldValue('coupon', String(value ?? ''))}
          />
          <DatePickerInput
            label="日期"
            valueFormat="YYYY-MM-DD"
            value={form.values.date}
            onChange={(value) => form.setFieldValue('date', value ?? today)}
          />
          <TextInput
            label="备注"
            placeholder="写点什么，方便以后搜索"
            value={form.values.note}
            onChange={(event) => form.setFieldValue('note', event.currentTarget.value)}
          />
        </div>
      </Collapse>

      {device === 'pc' && (
        <div className="hf-entry-footer">
          <Button variant="default" onClick={() => commit(true)}>保存</Button>
          <Button className="mb-accent-btn" onClick={() => commit(false)}>保存并再记 ⏎</Button>
        </div>
      )}
    </div>
  )

  if (device === 'mobile') {
    return (
      <Drawer
        opened={open}
        onClose={closeAndReset}
        position="bottom"
        size="92%"
        title="记一笔"
        classNames={{ body: 'hf-drawer-body hf-drawer-body--entry' }}
      >
        <div className="hf-entry-mobile">
          <div className="hf-entry-scroll">{body}</div>
          <div className="hf-entry-keypad">
            <div className="hf-keypad-grid">
              {KEYPAD.map((key) => (
                <UnstyledButton
                  key={key}
                  className="hf-keypad-key mb-num"
                  aria-label={key === '⌫' ? '退格' : key}
                  onClick={() => appendKey(key)}
                >
                  {key}
                </UnstyledButton>
              ))}
            </div>
            <div className="hf-entry-footer hf-entry-footer--mobile">
              <Button variant="default" onClick={() => commit(true)}>仅保存</Button>
              <Button className="mb-accent-btn" onClick={() => commit(false)} leftSection={<Plus />}>
                保存并再记
              </Button>
            </div>
          </div>
        </div>
      </Drawer>
    )
  }

  return (
    <Modal
      opened={open}
      onClose={closeAndReset}
      centered
      title="记账"
      size="var(--mb-entry-w)"
      classNames={{ body: 'hf-modal-body' }}
    >
      {body}
    </Modal>
  )
}
