import { useState } from 'react'
import { Button, Drawer, Modal, SegmentedControl, TextInput } from '@mantine/core'
import type { Ledger, NewTransactionInput } from './model'
import { accountKindLabel, formatDateLabel, TODAY } from './model'
import { useLedger } from './ledgerStore'
import type { DeviceMode } from '@/features/shared/types'
import './overlays.css'

type EntryType = 'expense' | 'income'

function toCents(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric * 100)
}

function EntryForm({
  ledger,
  onSubmit,
  onClose,
}: {
  ledger: Ledger
  onSubmit: (input: NewTransactionInput) => void
  onClose: () => void
}) {
  const [type, setType] = useState<EntryType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('food')
  const [accountId, setAccountId] = useState('wx')
  const [note, setNote] = useState('')

  const cents = toCents(amount)
  const invalid = amount.trim() !== '' && cents === null
  const categories = ledger.categories.filter(
    (category) => category.type === (type === 'income' ? 'income' : 'expense') && !category.parentId,
  )

  const changeType = (value: string) => {
    const next = value === 'income' ? 'income' : 'expense'
    setType(next)
    setCategoryId(next === 'income' ? 'salary' : 'food')
  }

  const submit = () => {
    if (cents === null) return
    onSubmit({ type, categoryId, accountId, amount: cents, note })
    setAmount('')
    setNote('')
    onClose()
  }

  return (
    <div className="mb-entry-form">
      <SegmentedControl
        fullWidth
        value={type}
        onChange={changeType}
        className="mb-seg"
        data={[
          { label: '支出', value: 'expense' },
          { label: '收入', value: 'income' },
        ]}
      />

      <div className="mb-entry-field">
        <label className="mb-field-label" htmlFor="mb-entry-amount">
          金额
        </label>
        <TextInput
          id="mb-entry-amount"
          data-autofocus
          aria-label="金额"
          placeholder="0.00"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.currentTarget.value)}
          leftSection={<span className="mb-currency">¥</span>}
          classNames={{ input: 'mb-input' }}
          error={invalid ? '请输入大于 0 的金额' : undefined}
        />
      </div>

      <fieldset className="mb-entry-field">
        <legend className="mb-field-label">分类</legend>
        <div className="mb-chip-row">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="mb-chip"
              aria-pressed={category.id === categoryId}
              onClick={() => setCategoryId(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-entry-field">
        <legend className="mb-field-label">账户</legend>
        <div className="mb-chip-row">
          {ledger.accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className="mb-chip"
              aria-pressed={account.id === accountId}
              aria-label={`${account.name}（${accountKindLabel(account.kind)}）`}
              onClick={() => setAccountId(account.id)}
            >
              {account.name}
            </button>
          ))}
        </div>
      </fieldset>

      <TextInput
        label="备注"
        placeholder="例如：公司楼下午餐"
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        classNames={{ label: 'mb-field-label', input: 'mb-input' }}
      />

      <p className="mb-entry-hint">
        日期 {formatDateLabel(TODAY)} · 保存后账本与总览数字会立即更新。连续记账与快捷键在后续批次开放。
      </p>

      <div className="mb-entry-actions">
        <Button variant="default" className="mb-secondary-btn" onClick={onClose}>
          取消
        </Button>
        <Button className="mb-primary-btn" onClick={submit} disabled={cents === null}>
          保存
        </Button>
      </div>
    </div>
  )
}

export function QuickEntry({
  opened,
  device,
  onClose,
  onSaved,
}: {
  opened: boolean
  device: DeviceMode
  onClose: () => void
  onSaved: () => void
}) {
  const { ledger, addTransaction } = useLedger()

  const title = (
    <span className="mb-overlay-title-copy">
      <span className="mb-overlay-title">记一笔</span>
      <span className="mb-overlay-sub">先记下来，之后可以再补充细节</span>
    </span>
  )

  if (device === 'mobile') {
    return (
      <Drawer
        opened={opened}
        onClose={onClose}
        position="bottom"
        size="auto"
        withinPortal={false}
        title={title}
        classNames={{
          content: 'mb-sheet',
          header: 'mb-overlay-head',
          title: 'mb-overlay-title-wrap',
          body: 'mb-overlay-body',
          overlay: 'mb-overlay',
          close: 'mb-overlay-close',
        }}
      >
        <EntryForm
          ledger={ledger}
          onClose={onClose}
          onSubmit={(input) => {
            addTransaction(input)
            onSaved()
          }}
        />
      </Drawer>
    )
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="auto"
      withinPortal={false}
      title={title}
      classNames={{
        content: 'mb-modal',
        header: 'mb-overlay-head',
        title: 'mb-overlay-title-wrap',
        body: 'mb-overlay-body',
        overlay: 'mb-overlay',
        close: 'mb-overlay-close',
      }}
    >
      <EntryForm
        ledger={ledger}
        onClose={onClose}
        onSubmit={(input) => {
          addTransaction(input)
          onSaved()
        }}
      />
    </Modal>
  )
}
