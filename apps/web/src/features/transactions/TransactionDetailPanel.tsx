import { useEffect, useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { CategoryIcon } from '@/features/overview/category'
import { normalizeAmountInput } from '@/features/overview/amountInput'
import { amountText, signedAmountText } from '@/features/overview/format'
import {
  accountKindLabel,
  formatDateLabel,
  getAccount,
  getCategoryIconKey,
  getCategoryName,
  getCategoryRootId,
  getRefundList,
  getRefundSummary,
  getRelatedTransaction,
  transactionDirection,
  transactionRefLabel,
  transactionTone,
  type Ledger,
  type LedgerTransaction,
} from '@/features/overview/model'
import { mapperFromLedger, toLedgerTransaction } from '@/features/overview/apiLedger'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import { transactionApi } from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import type { DeviceMode } from '@/features/shared/types'
import type { LedgerMutationOutcome } from '@/features/overview/ledgerStore'
import type { TransactionPatch } from './ledgerOps'

type Mode = 'view' | 'edit' | 'confirm-delete'

/**
 * 未关联退款的可选关联入口：默认收起，点开才读取候选原交易。
 * 按 /transactions/refundable/list 现查，避免拿旧快照。
 */
function RefundLinkForm({
  transaction,
  ledger,
  onLink,
}: {
  transaction: LedgerTransaction
  ledger: Ledger
  onLink: (id: string, originalId: string | null) => Promise<LedgerMutationOutcome>
}) {
  const [expanded, setExpanded] = useState(false)
  const [candidates, setCandidates] = useState<LedgerTransaction[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setExpanded(false)
    setSelected('')
    setError('')
  }, [transaction.id])

  useEffect(() => {
    if (!expanded) return
    let cancelled = false

    setLoading(true)
    setError('')
    void transactionApi
      .getRefundableList()
      .then(unwrapApiData)
      .then((items) => {
        if (cancelled) return
        const mapper = mapperFromLedger(ledger)
        setCandidates(
          items
            .map((item) => toLedgerTransaction(item, mapper))
            .filter((item) => getRefundSummary(ledger, item).remaining > 0),
        )
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '读取可关联原交易失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [expanded, ledger, transaction.id])

  const confirm = async () => {
    if (!selected || saving) return
    setSaving(true)
    setError('')
    const result = await onLink(transaction.id, selected)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? '关联失败，请重试')
      return
    }
    setExpanded(false)
  }

  if (!expanded) {
    return (
      <HfButton className="mb-tx-refund-link-open" onClick={() => setExpanded(true)}>
        关联原交易
      </HfButton>
    )
  }

  return (
    <div className="mb-tx-refund-link-form">
      {loading ? (
        <p className="mb-tx-refund-link-hint">正在读取可关联原交易…</p>
      ) : candidates.length === 0 && !error ? (
        <p className="mb-tx-refund-link-hint">当前没有仍有可退余额的收入/支出。</p>
      ) : (
        <select
          className="mb-tx-select"
          aria-label="选择原交易"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">选择原交易…</option>
          {candidates.map((candidate) => {
            const summary = getRefundSummary(ledger, candidate)
            return (
              <option key={candidate.id} value={candidate.id}>
                {transactionRefLabel(ledger, candidate)} · {formatDateLabel(candidate.date)} · 可退{' '}
                {amountText(summary.remaining)}
              </option>
            )
          })}
        </select>
      )}
      {error && (
        <p className="mb-tx-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="mb-tx-refund-link-actions">
        <HfButton
          className="mb-tx-btn is-primary"
          onClick={() => void confirm()}
          disabled={!selected || saving}
        >
          {saving ? '关联中…' : '关联'}
        </HfButton>
        <HfButton
          className="mb-tx-btn is-ghost"
          onClick={() => setExpanded(false)}
          disabled={saving}
        >
          取消
        </HfButton>
      </div>
    </div>
  )
}

function DetailView({
  transaction,
  ledger,
  onEdit,
  onDelete,
  onClose,
  onOpenTransaction,
  onLinkRefund,
}: {
  transaction: LedgerTransaction
  ledger: Ledger
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
  onOpenTransaction: (transaction: LedgerTransaction) => void
  onLinkRefund: (id: string, originalId: string | null) => Promise<LedgerMutationOutcome>
}) {
  const tone = transactionTone(transaction)
  const category = getCategoryName(ledger, transaction.categoryId)
  const rootId = getCategoryRootId(ledger, transaction.categoryId)
  const iconKey = getCategoryIconKey(ledger, transaction.categoryId)
  const account = getAccount(ledger, transaction.accountId)
  const toAccount = transaction.toAccountId ? getAccount(ledger, transaction.toAccountId) : undefined
  const related = transaction.type === 'refund' ? getRelatedTransaction(ledger, transaction) : undefined
  const refundSummary =
    transaction.type === 'expense' || transaction.type === 'income'
      ? getRefundSummary(ledger, transaction)
      : null
  const refunds = refundSummary ? getRefundList(ledger, transaction) : []

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
              <CategoryIcon rootId={rootId} iconKey={iconKey} />
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
        {transaction.type === 'refund' && (
          <div>
            <dt>原交易</dt>
            <dd>
              {related ? (
                <HfButton
                  className="mb-tx-detail-link"
                  onClick={() => onOpenTransaction(related)}
                >
                  {`关联 #${transactionRefLabel(ledger, related)} · ${formatDateLabel(related.date)} · ${signedAmountText(related)}`}
                </HfButton>
              ) : (
                <span className="mb-tx-detail-muted">未关联原交易</span>
              )}
            </dd>
          </div>
        )}
        {refundSummary && refundSummary.state !== 'none' && (
          <div>
            <dt>退款</dt>
            <dd>
              <span className="mb-tx-refund-summary">
                已退款 {amountText(refundSummary.refunded)} / 剩余 {amountText(refundSummary.remaining)}
                {refundSummary.state === 'full' && <span className="mb-tx-refund-badge is-full">已全额退款</span>}
              </span>
              {refunds.length > 0 && (
                <span className="mb-tx-refund-items">
                  {refunds.map((refund) => (
                    <HfButton
                      key={refund.id}
                      className="mb-tx-refund-item"
                      onClick={() => onOpenTransaction(refund)}
                    >
                      <span>{formatDateLabel(refund.date)}</span>
                      <span className="mb-tx-refund-item-note">{refund.note || '退款'}</span>
                      <span className="mb-tx-refund-item-amount">{amountText(refund.amount)}</span>
                    </HfButton>
                  ))}
                </span>
              )}
            </dd>
          </div>
        )}
        <div>
          <dt>备注</dt>
          <dd>{transaction.note}</dd>
        </div>
        {transaction.excludeFromIncomeExpense && (
          <div>
            <dt>统计</dt>
            <dd>
              <span className="mb-tx-badge is-excluded">不计收支</span>
              <span className="mb-tx-detail-muted"> 仅影响余额，不进收支统计与预算</span>
            </dd>
          </div>
        )}
        <div>
          <dt>交易编号</dt>
          <dd className="mb-tx-detail-code">{transaction.id}</dd>
        </div>
      </dl>

      {transaction.type === 'refund' && !related && (
        <RefundLinkForm
          transaction={transaction}
          ledger={ledger}
          onLink={onLinkRefund}
        />
      )}

      <div className="mb-tx-detail-actions">
        <HfButton className="mb-tx-btn is-primary" onClick={onEdit}>
          <Pencil size={15} />
          编辑
        </HfButton>
        <HfButton className="mb-tx-btn is-danger" onClick={onDelete}>
          <Trash2 size={15} />
          删除
        </HfButton>
        <HfButton className="mb-tx-btn is-ghost" onClick={onClose}>
          关闭
        </HfButton>
      </div>
    </div>
  )
}

function EditForm({
  transaction,
  ledger,
  onSave,
  onSaved,
  onCancel,
}: {
  transaction: LedgerTransaction
  ledger: Ledger
  onSave: (patch: TransactionPatch) => Promise<LedgerMutationOutcome>
  onSaved: () => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(String(transaction.amount / 100))
  const [nextType, setNextType] = useState(transaction.type)
  const [categoryId, setCategoryId] = useState(transaction.categoryId)
  const [accountId, setAccountId] = useState(transaction.accountId)
  const [date, setDate] = useState(transaction.date)
  const [note, setNote] = useState(transaction.note)
  const [excluded, setExcluded] = useState(Boolean(transaction.excludeFromIncomeExpense))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

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
    if (type === 'adjustment') setExcluded(false)
    if (type === 'refund' && Number.isFinite(parsed) && parsed < 0) {
      setAmount(String(Math.abs(parsed)))
    }
  }

  const submit = async () => {
    if (invalid || saving) return
    setSaving(true)
    setSaveError('')
    const result = await onSave({
      amount: Math.round(parsed * 100),
      categoryId,
      accountId,
      date,
      note,
      ...(nextType !== transaction.type ? { type: nextType } : {}),
      excludeFromIncomeExpense:
        nextType === 'transfer' || nextType === 'adjustment' ? false : excluded,
    })
    setSaving(false)
    // 失败时保留表单与输入，错误就地回显，用户可直接重试。
    if (!result.ok) {
      setSaveError(result.error ?? '保存失败，请重试')
      return
    }
    onSaved()
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

      {(nextType === 'income' || nextType === 'expense' || nextType === 'refund') && (
        <label className="mb-tx-exclude-toggle">
          <input
            type="checkbox"
            checked={excluded}
            onChange={(event) => setExcluded(event.currentTarget.checked)}
          />
          <span>
            不计收支
            <span className="mb-tx-exclude-hint">仍影响余额，不进收支统计与预算</span>
          </span>
        </label>
      )}

      {errorText && (
        <p className="mb-tx-form-error" role="alert">
          {errorText}
          {nextType === 'expense' && (
            <span className="mb-tx-form-error-actions">
              <HfButton className="mb-tx-form-error-action" onClick={() => switchType('refund')}>
                改为退款
              </HfButton>
              <HfButton className="mb-tx-form-error-action" onClick={() => switchType('adjustment')}>
                改为调整
              </HfButton>
            </span>
          )}
        </p>
      )}

      {saveError && (
        <p className="mb-tx-form-error" role="alert">
          {saveError}
        </p>
      )}

      <div className="mb-tx-detail-actions">
        <HfButton className="mb-tx-btn is-primary" onClick={() => void submit()} disabled={invalid || saving}>
          <Check size={15} />
          {saving ? '保存中…' : '保存修改'}
        </HfButton>
        <HfButton className="mb-tx-btn is-ghost" onClick={onCancel} disabled={saving}>
          取消
        </HfButton>
      </div>
    </div>
  )
}

function DeleteConfirm({
  transaction,
  onConfirm,
  onCancel,
}: {
  transaction: LedgerTransaction
  onConfirm: () => Promise<LedgerMutationOutcome>
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    const result = await onConfirm()
    setSaving(false)
    if (!result.ok) setError(result.error ?? '删除失败，请重试')
  }

  return (
    <div className="mb-tx-confirm">
      <p className="mb-tx-confirm-title">删除这笔记录？</p>
      <p className="mb-tx-confirm-desc">
        {formatDateLabel(transaction.date)} · {transaction.note || '未填写备注'} ·{' '}
        {signedAmountText(transaction)}
      </p>
      <p className="mb-tx-confirm-note">删除后可用提示条撤销；账户余额会一并回滚。</p>
      {error && (
        <p className="mb-tx-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="mb-tx-detail-actions">
        <HfButton className="mb-tx-btn is-danger-solid" onClick={() => void confirm()} disabled={saving}>
          {saving ? '删除中…' : '删除'}
        </HfButton>
        <HfButton className="mb-tx-btn is-ghost" onClick={onCancel} disabled={saving}>
          <X size={15} />
          取消
        </HfButton>
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
  onOpenTransaction,
  onLinkRefund,
}: {
  transaction: LedgerTransaction | null
  ledger: Ledger
  device: DeviceMode
  onClose: () => void
  onSave: (id: string, patch: TransactionPatch) => Promise<LedgerMutationOutcome>
  onDelete: (id: string) => Promise<LedgerMutationOutcome>
  onOpenTransaction: (transaction: LedgerTransaction) => void
  onLinkRefund: (id: string, originalId: string | null) => Promise<LedgerMutationOutcome>
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
          key={transaction.id}
          transaction={transaction}
          ledger={ledger}
          onEdit={() => setMode('edit')}
          onDelete={() => setMode('confirm-delete')}
          onClose={close}
          onOpenTransaction={onOpenTransaction}
          onLinkRefund={onLinkRefund}
        />
      )}
      {mode === 'edit' && (
        <EditForm
          transaction={transaction}
          ledger={ledger}
          onSave={(patch) => onSave(transaction.id, patch)}
          onSaved={() => setMode('view')}
          onCancel={() => setMode('view')}
        />
      )}
      {mode === 'confirm-delete' && (
        <DeleteConfirm
          transaction={transaction}
          onConfirm={async () => {
            const result = await onDelete(transaction.id)
            if (result.ok) {
              setMode('view')
              onClose()
            }
            return result
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
    <HfSheet
      variant="transaction"
      device={device}
      opened
      onClose={close}
      title={titleNode}
      titleClassName="mb-tx-sheet-title-wrap"
    >
      {body}
    </HfSheet>
  )
}
