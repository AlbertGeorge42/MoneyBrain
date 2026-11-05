import { useState } from 'react'
import { Drawer } from '@mantine/core'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { CategoryIcon } from '@/features/overview/category'
import { normalizeAmountInput } from '@/features/overview/amountInput'
import { signedAmountText } from '@/features/overview/format'
import {
  accountKindLabel,
  formatDateLabel,
  getAccount,
  getCategoryName,
  getCategoryRootId,
  transactionDirection,
  transactionTone,
  type Ledger,
  type LedgerTransaction,
} from '@/features/overview/model'
import type { DeviceMode } from '@/features/shared/types'
import type { TransactionPatch } from './ledgerOps'

type Mode = 'view' | 'edit' | 'confirm-delete'

function DetailView({
  transaction,
  ledger,
  onEdit,
  onDelete,
  onClose,
}: {
  transaction: LedgerTransaction
  ledger: Ledger
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const tone = transactionTone(transaction)
  const category = getCategoryName(ledger, transaction.categoryId)
  const rootId = getCategoryRootId(ledger, transaction.categoryId)
  const account = getAccount(ledger, transaction.accountId)
  const toAccount = transaction.toAccountId ? getAccount(ledger, transaction.toAccountId) : undefined

  return (
    <div className="mb-tx-detail">
      <div className="mb-tx-detail-hero">
        <span className={`mb-tx-detail-amount is-${tone}`}>{signedAmountText(transaction)}</span>
        <span className="mb-tx-detail-meta">
          <span className={`mb-tx-badge is-${tone}`}>{transactionDirection(transaction)}</span>
          <span>{formatDateLabel(transaction.date)}</span>
        </span>
      </div>

      <dl className="mb-tx-detail-list">
        <div>
          <dt>分类</dt>
          <dd>
            <span className="mb-tx-detail-category">
              <CategoryIcon rootId={rootId} />
              {category}
            </span>
          </dd>
        </div>
        <div>
          <dt>账户</dt>
          <dd>{account ? `${account.name} · ${accountKindLabel(account.kind)}` : '未知账户'}</dd>
        </div>
        {toAccount && (
          <div>
            <dt>转入账户</dt>
            <dd>
              {toAccount.name} · {accountKindLabel(toAccount.kind)}
            </dd>
          </div>
        )}
        <div>
          <dt>备注</dt>
          <dd>{transaction.note}</dd>
        </div>
        <div>
          <dt>交易编号</dt>
          <dd className="mb-tx-detail-code">{transaction.id}</dd>
        </div>
      </dl>

      <p className="mb-tx-detail-note">数据只在本机；这笔记录不会上传到任何服务器。</p>

      <div className="mb-tx-detail-actions">
        <button type="button" className="mb-tx-btn is-primary" onClick={onEdit}>
          <Pencil size={15} />
          编辑
        </button>
        <button type="button" className="mb-tx-btn is-danger" onClick={onDelete}>
          <Trash2 size={15} />
          删除
        </button>
        <button type="button" className="mb-tx-btn is-ghost" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}

function EditForm({
  transaction,
  ledger,
  onSave,
  onCancel,
}: {
  transaction: LedgerTransaction
  ledger: Ledger
  onSave: (patch: TransactionPatch) => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(String(transaction.amount / 100))
  const [nextType, setNextType] = useState(transaction.type)
  const [categoryId, setCategoryId] = useState(transaction.categoryId)
  const [accountId, setAccountId] = useState(transaction.accountId)
  const [date, setDate] = useState(transaction.date)
  const [note, setNote] = useState(transaction.note)

  const categories = ledger.categories.filter((category) => category.type === nextType)
  // 银行 App 复制来的货币符号 / 千分位 / 全角数字不能挡路：解析前统一归一化。
  const parsed = Number(normalizeAmountInput(amount))
  const invalid =
    !Number.isFinite(parsed) || (nextType === 'adjustment' ? parsed === 0 : parsed <= 0)
  // 错误态与输入实时联动：有错就标红并禁用保存，不再等点保存才报。
  const errorText = invalid
    ? nextType === 'adjustment'
      ? '调整金额不能为 0。'
      : '金额需大于 0。退款请改用退款类型，冲正请用调整。'
    : ''

  // 切到退款时把负数金额转正：支出语义下的 −28 就是退款 +28，
  // 否则用户点了出口仍被「金额需大于 0」挡住，保存不可达。
  const switchType = (type: 'refund' | 'adjustment') => {
    setNextType(type)
    setCategoryId(ledger.categories.find((category) => category.type === type)?.id ?? categoryId)
    if (type === 'refund' && Number.isFinite(parsed) && parsed < 0) {
      setAmount(String(Math.abs(parsed)))
    }
  }

  const submit = () => {
    if (invalid) return
    onSave({
      amount: Math.round(parsed * 100),
      categoryId,
      accountId,
      date,
      note,
      ...(nextType !== transaction.type ? { type: nextType } : {}),
    })
  }

  return (
    <div className="mb-tx-edit">
      <label className="mb-tx-field" htmlFor="mb-tx-edit-amount">
        <span className="mb-tx-field-label">金额（元）</span>
        <input
          id="mb-tx-edit-amount"
          className="mb-tx-input"
          type="number"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>

      <label className="mb-tx-field" htmlFor="mb-tx-edit-category">
        <span className="mb-tx-field-label">分类</span>
        <select
          id="mb-tx-edit-category"
          className="mb-tx-select"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.parentId ? `· ${category.name}` : category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-tx-field" htmlFor="mb-tx-edit-account">
        <span className="mb-tx-field-label">账户</span>
        <select
          id="mb-tx-edit-account"
          className="mb-tx-select"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
        >
          {ledger.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-tx-field" htmlFor="mb-tx-edit-date">
        <span className="mb-tx-field-label">日期</span>
        <input
          id="mb-tx-edit-date"
          className="mb-tx-input"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>

      <label className="mb-tx-field" htmlFor="mb-tx-edit-note">
        <span className="mb-tx-field-label">备注</span>
        <input
          id="mb-tx-edit-note"
          className="mb-tx-input"
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {errorText && (
        <p className="mb-tx-form-error" role="alert">
          {errorText}
          {nextType === 'expense' && (
            <span className="mb-tx-form-error-actions">
              <button type="button" className="mb-tx-form-error-action" onClick={() => switchType('refund')}>
                改为退款
              </button>
              <button type="button" className="mb-tx-form-error-action" onClick={() => switchType('adjustment')}>
                改为调整
              </button>
            </span>
          )}
        </p>
      )}

      <div className="mb-tx-detail-actions">
        <button type="button" className="mb-tx-btn is-primary" onClick={submit} disabled={invalid}>
          <Check size={15} />
          保存修改
        </button>
        <button type="button" className="mb-tx-btn is-ghost" onClick={onCancel}>
          取消
        </button>
      </div>
      <p className="mb-tx-detail-note">保存后账户余额与总览数字会同步更新。</p>
    </div>
  )
}

function DeleteConfirm({
  transaction,
  onConfirm,
  onCancel,
}: {
  transaction: LedgerTransaction
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="mb-tx-confirm">
      <p className="mb-tx-confirm-title">删除这笔记录？</p>
      <p className="mb-tx-confirm-desc">
        {formatDateLabel(transaction.date)} · {transaction.note || '未填写备注'} ·{' '}
        {signedAmountText(transaction)}
      </p>
      <p className="mb-tx-confirm-note">删除后可用提示条撤销；账户余额会一并回滚。</p>
      <div className="mb-tx-detail-actions">
        <button type="button" className="mb-tx-btn is-danger-solid" onClick={onConfirm}>
          删除
        </button>
        <button type="button" className="mb-tx-btn is-ghost" onClick={onCancel}>
          <X size={15} />
          取消
        </button>
      </div>
    </div>
  )
}

export function TransactionDetailPanel({
  transaction,
  ledger,
  device,
  onClose,
  onSave,
  onDelete,
}: {
  transaction: LedgerTransaction | null
  ledger: Ledger
  device: DeviceMode
  onClose: () => void
  onSave: (id: string, patch: TransactionPatch) => void
  onDelete: (id: string) => void
}) {
  const [mode, setMode] = useState<Mode>('view')
  if (!transaction) return null

  const title = mode === 'edit' ? '编辑流水' : mode === 'confirm-delete' ? '删除流水' : '交易详情'
  const close = () => {
    setMode('view')
    onClose()
  }

  const body = (
    <>
      {mode === 'view' && (
        <DetailView
          transaction={transaction}
          ledger={ledger}
          onEdit={() => setMode('edit')}
          onDelete={() => setMode('confirm-delete')}
          onClose={close}
        />
      )}
      {mode === 'edit' && (
        <EditForm
          transaction={transaction}
          ledger={ledger}
          onSave={(patch) => {
            onSave(transaction.id, patch)
            setMode('view')
          }}
          onCancel={() => setMode('view')}
        />
      )}
      {mode === 'confirm-delete' && (
        <DeleteConfirm
          transaction={transaction}
          onConfirm={() => {
            onDelete(transaction.id)
            setMode('view')
            onClose()
          }}
          onCancel={() => setMode('view')}
        />
      )}
    </>
  )

  const titleNode = (
    <span className="mb-tx-sheet-title-wrap">
      <span className="mb-tx-sheet-title">{title}</span>
      <span className="mb-tx-sheet-sub">{formatDateLabel(transaction.date)}</span>
    </span>
  )

  return (
    <Drawer
      opened
      onClose={close}
      position={device === 'mobile' ? 'bottom' : 'right'}
      withinPortal={false}
      title={titleNode}
      classNames={{
        content: device === 'mobile' ? 'mb-tx-sheet' : 'mb-tx-side',
        header: 'mb-tx-sheet-head',
        title: 'mb-tx-sheet-title-wrap',
        body: 'mb-tx-sheet-body',
        overlay: 'mb-tx-overlay',
        close: 'mb-tx-sheet-close',
      }}
    >
      {body}
    </Drawer>
  )
}
