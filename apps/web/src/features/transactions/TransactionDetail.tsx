import { useEffect, useState } from 'react'
import {
  Button,
  Drawer,
  Modal,
  NumberInput,
  Select,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { CategoryGlyph } from '../../ui/CategoryGlyph'
import {
  TYPE_LABELS,
  accountName,
  categoryName,
  formatAmount,
  formatFullDate,
  formatUnsigned,
  txTone,
} from './transaction-utils'
import type { Account, Category, DeviceMode, Transaction } from './types'

type TransactionDetailProps = {
  open: boolean
  device: DeviceMode
  tx: Transaction | undefined
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onSave: (tx: Transaction) => void
  onDelete: (id: string) => void
}

type EditDraft = {
  amount: string
  categoryId: string
  accountId: string
  toAccountId: string
  date: string
  note: string
  fee: string
  coupon: string
}

function draftFrom(tx: Transaction): EditDraft {
  return {
    amount: String(Math.abs(tx.amount)),
    categoryId: tx.categoryId,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId ?? '',
    date: tx.date,
    note: tx.note,
    fee: tx.fee === undefined ? '' : String(tx.fee),
    coupon: tx.coupon === undefined ? '' : String(tx.coupon),
  }
}

export function TransactionDetail({ open, device, tx, accounts, categories, onClose, onSave, onDelete }: TransactionDetailProps) {
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEditing(false)
    setDeleteOpen(false)
    setError(null)
    setDraft(tx ? draftFrom(tx) : null)
  }, [open, tx])

  if (!tx || !draft) {
    return (
      <Drawer opened={open} onClose={onClose} position={device === 'mobile' ? 'bottom' : 'right'} size="var(--mb-panel-w)" title="交易详情">
        <div />
      </Drawer>
    )
  }

  const category = categories.find((item) => item.id === tx.categoryId)
  const account = accounts.find((item) => item.id === tx.accountId)
  const toAccount = accounts.find((item) => item.id === tx.toAccountId)
  const tone = txTone(tx)
  const editCategories = categories.filter((item) => item.types.includes(tx.type))

  const patchDraft = (patch: Partial<EditDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  const saveEdit = () => {
    const amount = Number(draft.amount)
    if (!draft.amount.trim() || Number.isNaN(amount) || amount <= 0) {
      setError('金额需大于 0')
      return
    }
    setError(null)
    const signed =
      tx.type === 'income' || tx.type === 'refund'
        ? amount
        : tx.type === 'adjust'
          ? tx.amount >= 0
            ? amount
            : -amount
          : -amount
    const nextCategory = categories.find((item) => item.id === draft.categoryId)
    onSave({
      ...tx,
      amount: signed,
      categoryId: draft.categoryId,
      accountId: draft.accountId,
      toAccountId: tx.type === 'transfer' ? draft.toAccountId : undefined,
      date: draft.date,
      note: draft.note,
      subcategory: draft.note.trim() || nextCategory?.name || tx.subcategory,
      fee: draft.fee.trim() ? Number(draft.fee) : undefined,
      coupon: draft.coupon.trim() ? Number(draft.coupon) : undefined,
    })
    setEditing(false)
  }

  const detailFields: Array<{ label: string; value: string }> = [
    { label: '日期', value: formatFullDate(tx.date) },
    { label: '分类', value: category ? `${category.name} · ${tx.subcategory}` : tx.subcategory },
    { label: '账户', value: accountName(account, tx.accountId) },
  ]
  if (tx.type === 'transfer' && toAccount) {
    detailFields.push({ label: '转入', value: toAccount.name })
  }
  detailFields.push({ label: '类型', value: TYPE_LABELS[tx.type] })
  if (tx.fee !== undefined) detailFields.push({ label: '手续费', value: formatUnsigned(tx.fee) })
  if (tx.coupon !== undefined) detailFields.push({ label: '优惠券', value: formatUnsigned(tx.coupon) })
  detailFields.push({ label: '备注', value: tx.note || '—' })

  const confirmCopy = `将删除「${categoryName(category, tx.categoryId)} · ${tx.subcategory}」这笔记录。删除后可撤销。`

  const confirmBody = (
    <div className="hf-confirm">
      <p className="mb-text-1">{confirmCopy}</p>
      <div className="hf-confirm-actions">
        <Button variant="default" onClick={() => setDeleteOpen(false)}>取消</Button>
        <Button className="mb-danger-solid" onClick={() => { setDeleteOpen(false); onDelete(tx.id) }}>删除</Button>
      </div>
    </div>
  )

  return (
    <>
      <Drawer
        opened={open}
        onClose={onClose}
        position={device === 'mobile' ? 'bottom' : 'right'}
        size={device === 'mobile' ? '86%' : 'var(--mb-panel-w)'}
        title={editing ? '编辑交易' : '交易详情'}
        classNames={{ body: 'hf-drawer-body' }}
      >
        {editing ? (
          <div className="hf-detail-edit">
            <UnstyledButton className="hf-detail-back" onClick={() => { setEditing(false); setError(null); setDraft(draftFrom(tx)) }}>
              <ArrowLeft aria-hidden /> 返回详情
            </UnstyledButton>
            <TextInput
              label="金额"
              value={draft.amount}
              inputMode="decimal"
              className="hf-entry-amount"
              onChange={(event) => patchDraft({ amount: event.currentTarget.value.replace(/[^0-9.]/g, '') })}
            />
            {error && <div className="hf-entry-error" role="alert">{error}</div>}
            <Select
              label="分类"
              value={draft.categoryId}
              data={editCategories.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => patchDraft({ categoryId: value ?? tx.categoryId })}
              allowDeselect={false}
            />
            <Select
              label="账户"
              value={draft.accountId}
              data={accounts.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => patchDraft({ accountId: value ?? tx.accountId })}
              allowDeselect={false}
            />
            {tx.type === 'transfer' && (
              <Select
                label="转入账户"
                value={draft.toAccountId}
                data={accounts.filter((item) => item.id !== draft.accountId).map((item) => ({ value: item.id, label: item.name }))}
                onChange={(value) => patchDraft({ toAccountId: value ?? draft.toAccountId })}
                allowDeselect={false}
              />
            )}
            <DatePickerInput
              label="日期"
              valueFormat="YYYY-MM-DD"
              value={draft.date}
              onChange={(value) => patchDraft({ date: value ?? tx.date })}
            />
            <TextInput label="备注" value={draft.note} onChange={(event) => patchDraft({ note: event.currentTarget.value })} />
            <div className="hf-entry-more-fields">
              <NumberInput
                label="手续费"
                min={0}
                hideControls
                value={draft.fee}
                onChange={(value) => patchDraft({ fee: String(value ?? '') })}
              />
              <NumberInput
                label="优惠券"
                min={0}
                hideControls
                value={draft.coupon}
                onChange={(value) => patchDraft({ coupon: String(value ?? '') })}
              />
            </div>
            <Button className="mb-accent-btn" fullWidth onClick={saveEdit}>保存修改</Button>
          </div>
        ) : (
          <div className="tx-detail">
            <div className="tx-detail-hero">
              <div className="tx-detail-amount mb-num" data-tone={tone}>{formatAmount(tx.amount)}</div>
              <div className="tx-detail-meta">
                {category && <CategoryGlyph icon={category.icon} colorIndex={category.colorIndex} />}
                <div>
                  <div className="mb-title-3">{categoryName(category, tx.categoryId)} · {tx.subcategory}</div>
                  <div className="mb-text-1">{accountName(account, tx.accountId)} · {formatFullDate(tx.date)}</div>
                </div>
              </div>
            </div>
            <dl className="tx-detail-fields">
              {detailFields.map((field) => (
                <div key={field.label} className="tx-detail-field">
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
            <div className="tx-detail-actions">
              <Button variant="default" leftSection={<Pencil size={16} />} onClick={() => setEditing(true)}>编辑</Button>
              <Button variant="default" className="mb-danger-text" leftSection={<Trash2 size={16} />} onClick={() => setDeleteOpen(true)}>删除</Button>
            </div>
          </div>
        )}
      </Drawer>

      {device === 'mobile' ? (
        <Drawer opened={deleteOpen} onClose={() => setDeleteOpen(false)} position="bottom" size="auto" title="删除这笔？">
          {confirmBody}
        </Drawer>
      ) : (
        <Modal opened={deleteOpen} onClose={() => setDeleteOpen(false)} centered title="删除这笔？">
          {confirmBody}
        </Modal>
      )}
    </>
  )
}
