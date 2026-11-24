import { useEffect, useState } from 'react'
import { Check, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { CategoryIcon } from '@/features/overview/category'
import { parseMoneyInput } from '@/utils/money'
import { toMajor } from '@domain/index'
import { amountText, signedAmountText } from '@/features/overview/format'
import {
  accountKindLabel,
  formatDateLabel,
  getAccount,
  getCategoryIconKey,
  getCategoryName,
  getRelatedTransaction,
  transactionDirection,
  transactionRefLabel,
  transactionTone,
  type Ledger,
  type LedgerTransaction,
} from '@/features/overview/model'
import { toLedgerTransaction } from '@/features/overview/apiLedger'
import { Button } from '@/features/shared/Button'
import { FieldLabel } from '@/features/shared/FieldLabel'
import { RefundSummarySection } from '@/features/shared/RefundSummarySection'
import { Badge } from '@/features/shared/Badge'
import { Sheet } from '@/features/shared/Sheet'
import { transactionApi } from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import type { DeviceMode } from '@/features/shared/types'
import type { LedgerMutationOutcome } from '@/features/overview/ledgerStore'
import type { TransactionPatch } from './ledgerOps'

type Mode = 'view' | 'edit' | 'refund' | 'confirm-delete'

/**
 * 从一笔收入 / 支出创建关联退款。记一笔表单已移除退款 tab，这里是退款的可写入口。
 * 金额默认取原交易金额（允许高于原额），账户默认原账户；关联继承原交易分类。
 */
function RefundCreateForm({
  transaction,
  ledger,
  onSave,
  onSaved,
  onCancel,
}: {
  transaction: LedgerTransaction
  ledger: Ledger
  onSave: (originalId: string, categoryId: string, accountId: string, amount: number, note: string) => Promise<LedgerMutationOutcome>
  onSaved: () => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(String(transaction.amount / 100))
  const [accountId, setAccountId] = useState(transaction.accountId)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const cents = parseMoneyInput(amount)
  // 退款金额允许高于原交易金额，只需是正数。
  const invalid = cents === null || cents <= 0

  const submit = async () => {
    if (invalid || saving) return
    setSaving(true)
    setError('')
    const result = await onSave(transaction.id, transaction.categoryId, accountId, cents, note)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? '退款创建失败，请重试')
      return
    }
    onSaved()
  }

  return (
    <div className="mb-tx-refund-create">
      <p className="mb-tx-refund-create-hint">
        原交易金额 {amountText(transaction.amount)}。退款会作为一笔独立交易冲减原记录，不会修改原交易本身；金额允许高于原金额。
      </p>
      <label className="mb-tx-field" htmlFor="mb-tx-refund-amount">
        <FieldLabel>退款金额（元）</FieldLabel>
        <input
          id="mb-tx-refund-amount"
          className="mb-shared-input"
          type="number"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.currentTarget.value)}
        />
      </label>
      <label className="mb-tx-field" htmlFor="mb-tx-refund-account">
        <FieldLabel>退款账户</FieldLabel>
        <select
          id="mb-tx-refund-account"
          className="mb-shared-input mb-shared-input--select"
          value={accountId}
          onChange={(event) => setAccountId(event.currentTarget.value)}
        >
          {ledger.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-tx-field" htmlFor="mb-tx-refund-note">
        <FieldLabel>备注</FieldLabel>
        <input
          id="mb-tx-refund-note"
          className="mb-shared-input"
          type="text"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
      </label>
      {error && <p className="mb-tx-form-error" role="alert">{error}</p>}
      <div className="mb-tx-detail-actions">
        <Button variant="primary" onClick={() => void submit()} disabled={invalid || saving}>
          <Check size={15} />
          {saving ? '创建中…' : '创建退款'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>取消</Button>
      </div>
    </div>
  )
}

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
        setCandidates(items.map((item) => toLedgerTransaction(item)))
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
      <Button className="mb-tx-refund-link-open" onClick={() => setExpanded(true)}>
        关联原交易
      </Button>
    )
  }

  return (
    <div className="mb-tx-refund-link-form">
      {loading ? (
        <p className="mb-tx-refund-link-hint">正在读取可关联原交易…</p>
      ) : candidates.length === 0 && !error ? (
        <p className="mb-tx-refund-link-hint">当前没有可关联的收入/支出。</p>
      ) : (
        <select
          className="mb-shared-input mb-shared-input--select"
          aria-label="选择原交易"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">选择原交易…</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {transactionRefLabel(ledger, candidate)} · {formatDateLabel(candidate.date)} ·{' '}
              {amountText(candidate.amount)}
            </option>
          ))}
        </select>
      )}
      {error && (
        <p className="mb-tx-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="mb-tx-refund-link-actions">
        <Button
          variant="primary"
          onClick={() => void confirm()}
          disabled={!selected || saving}
        >
          {saving ? '关联中…' : '关联'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setExpanded(false)}
          disabled={saving}
        >
          取消
        </Button>
      </div>
    </div>
  )
}

function DetailView({
  transaction,
  ledger,
  onEdit,
  onDelete,
  onOpenTransaction,
  onLinkRefund,
  onCreateRefund,
}: {
  transaction: LedgerTransaction
  ledger: Ledger
  onEdit: () => void
  onDelete: () => void
  onOpenTransaction: (transaction: LedgerTransaction) => void
  onLinkRefund: (id: string, originalId: string | null) => Promise<LedgerMutationOutcome>
  onCreateRefund: () => void
}) {
  const tone = transactionTone(transaction)
  const category = getCategoryName(ledger, transaction.categoryId)
  const iconKey = getCategoryIconKey(ledger, transaction.categoryId)
  const account = getAccount(ledger, transaction.accountId)
  const toAccount = transaction.toAccountId ? getAccount(ledger, transaction.toAccountId) : undefined
  const related = transaction.type === 'refund' ? getRelatedTransaction(ledger, transaction) : undefined

  return (
    <div className="mb-tx-detail">
      <div className="mb-tx-detail-hero">
        <span className={`mb-tx-detail-amount --${tone}`}>{signedAmountText(transaction)}</span>
        <span className="mb-tx-detail-meta">
          <Badge tone={tone}>{transactionDirection(transaction)}</Badge>
          <span>{formatDateLabel(transaction.date)}</span>
        </span>
      </div>

      <dl className="mb-tx-detail-list">
        <div>
          <dt>分类</dt>
          <dd>
            <span className="mb-tx-detail-category">
              <CategoryIcon iconKey={iconKey} />
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
                <Button
                  className="mb-tx-detail-link"
                  onClick={() => onOpenTransaction(related)}
                >
                  {`关联 #${transactionRefLabel(ledger, related)} · ${formatDateLabel(related.date)} · ${signedAmountText(related)}`}
                </Button>
              ) : (
                <span className="mb-tx-detail-muted">未关联原交易</span>
              )}
            </dd>
          </div>
        )}
        <RefundSummarySection ledger={ledger} transaction={transaction} onOpenTransaction={onOpenTransaction} />
        <div>
          <dt>备注</dt>
          <dd>{transaction.note}</dd>
        </div>
        {transaction.excludeFromIncomeExpense && (
          <div>
            <dt>统计</dt>
            <dd>
              <Badge tone="excluded">不计收支</Badge>
              <span className="mb-tx-detail-muted"> 仅影响余额，不进收支统计与预算</span>
            </dd>
          </div>
        )}
      </dl>

      {transaction.type === 'refund' && !related && (
        <RefundLinkForm
          transaction={transaction}
          ledger={ledger}
          onLink={onLinkRefund}
        />
      )}

      <div className="mb-tx-detail-actions">
        {(transaction.type === 'income' || transaction.type === 'expense') && (
          <Button onClick={onCreateRefund}>
            <RotateCcw size={15} />
            记一笔退款
          </Button>
        )}
        <Button variant="primary" onClick={onEdit}>
          <Pencil size={15} />
          编辑
        </Button>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 size={15} />
          删除
        </Button>
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
  // 银行 App 复制来的货币符号 / 千分位 / 全角数字不能挡路；
  // 解析内核只有 Domain 的 parseAmount，这里只按交易类型裁定正负与 0。
  const parsedCents = parseMoneyInput(amount, { allowNegative: true, allowZero: true })
  const parsed = parsedCents === null ? Number.NaN : toMajor(parsedCents)
  const invalid =
    !Number.isFinite(parsed) || (nextType === 'adjustment' ? parsed === 0 : parsed <= 0)
  // 错误态与输入实时联动：有错就标红并禁用保存，不再等点保存才报。
  const errorText = invalid
    ? nextType === 'adjustment'
      ? '调整金额不能为 0。'
      : '金额需大于 0。'
    : ''

  // 切到平账时把负数金额转正，避免被「金额需大于 0」挡住。
  const switchType = (type: 'adjustment') => {
    setNextType(type)
    setCategoryId(ledger.categories.find((category) => category.type === type)?.id ?? categoryId)
    setExcluded(false)
    if (Number.isFinite(parsed) && parsed < 0) {
      setAmount(String(Math.abs(parsed)))
    }
  }

  const submit = async () => {
    if (invalid || parsedCents === null || saving) return
    setSaving(true)
    setSaveError('')
    const result = await onSave({
      amount: parsedCents,
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
        <FieldLabel>金额（元）</FieldLabel>
        <input
          id="mb-tx-edit-amount"
          className="mb-shared-input"
          type="number"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>

      {nextType !== 'transfer' && (
        <label className="mb-tx-field" htmlFor="mb-tx-edit-category">
          <FieldLabel>分类</FieldLabel>
          <select
            id="mb-tx-edit-category"
            className="mb-shared-input mb-shared-input--select"
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
      )}
      {nextType === 'transfer' && (
        <p className="mb-tx-edit-hint">转账分类按账户性质自动判定，无需选择。</p>
      )}

      <label className="mb-tx-field" htmlFor="mb-tx-edit-account">
        <FieldLabel>账户</FieldLabel>
        <select
          id="mb-tx-edit-account"
          className="mb-shared-input mb-shared-input--select"
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
        <FieldLabel>日期</FieldLabel>
        <input
          id="mb-tx-edit-date"
          className="mb-shared-input"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>

      <label className="mb-tx-field" htmlFor="mb-tx-edit-note">
        <FieldLabel>备注</FieldLabel>
        <input
          id="mb-tx-edit-note"
          className="mb-shared-input"
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
              <Button className="mb-tx-form-error-action" onClick={() => switchType('adjustment')}>
                改为平账
              </Button>
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
        <Button variant="primary" onClick={() => void submit()} disabled={invalid || saving}>
          <Check size={15} />
          {saving ? '保存中…' : '保存修改'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          取消
        </Button>
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
        <Button variant="danger-solid" onClick={() => void confirm()} disabled={saving}>
          {saving ? '删除中…' : '删除'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          <X size={15} />
          取消
        </Button>
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
  onCreateRefund,
}: {
  transaction: LedgerTransaction | null
  ledger: Ledger
  device: DeviceMode
  onClose: () => void
  onSave: (id: string, patch: TransactionPatch) => Promise<LedgerMutationOutcome>
  onDelete: (id: string) => Promise<LedgerMutationOutcome>
  onOpenTransaction: (transaction: LedgerTransaction) => void
  onLinkRefund: (id: string, originalId: string | null) => Promise<LedgerMutationOutcome>
  onCreateRefund: (originalId: string, categoryId: string, accountId: string, amount: number, note: string) => Promise<LedgerMutationOutcome>
}) {
  const [mode, setMode] = useState<Mode>('view')
  // 抽屉常驻渲染、由 opened 受控，Mantine 才能走进入 / 退出动画；
  // 切换交易时回到查看态，避免上一笔的编辑态带到下一笔。
  useEffect(() => setMode('view'), [transaction?.id])

  const title = mode === 'edit' ? '编辑流水' : mode === 'refund' ? '记一笔退款' : mode === 'confirm-delete' ? '删除流水' : '交易详情'
  const close = () => {
    setMode('view')
    onClose()
  }

  const body = !transaction ? null : (
    <>
      {mode === 'view' && (
        <DetailView
          key={transaction.id}
          transaction={transaction}
          ledger={ledger}
          onEdit={() => setMode('edit')}
          onDelete={() => setMode('confirm-delete')}
          onOpenTransaction={onOpenTransaction}
          onLinkRefund={onLinkRefund}
          onCreateRefund={() => setMode('refund')}
        />
      )}
      {mode === 'refund' && transaction && (
        <RefundCreateForm
          transaction={transaction}
          ledger={ledger}
          onSave={onCreateRefund}
          onSaved={() => setMode('view')}
          onCancel={() => setMode('view')}
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

  return (
    <Sheet
      variant="report"
      device={device}
      opened={Boolean(transaction)}
      onClose={close}
      title={title}
    >
      {body}
    </Sheet>
  )
}
