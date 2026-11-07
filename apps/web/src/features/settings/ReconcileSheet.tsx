import { useState } from 'react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import { X } from 'lucide-react'
import { minor } from '@domain/index'
import type { AccountReconcileResult } from '@contracts/types'
import { accountApi } from '@/services/api'
import { ApiClientError, getApiErrorMessage } from '@/services/apiError'
import { unwrapApiData } from '@/services/apiResult'
import { todayLocal } from '@/features/overview/apiLedger'
import { formatCurrency } from '@/utils/format'

type ReconcileMode = 'overwrite' | 'append'

interface ConflictState {
  existingAmount: number
  existingTransactionId: string
}

/**
 * 账户行「对账」入口：填「日期 + 真实余额」，后端算账面差额并生成可见平账分录。
 * 同日已有平账记录时先提示覆盖 / 追加，默认覆盖，绝不静默追加。
 */
export function ReconcileButton({
  account,
  device,
  onDone,
}: {
  account: { id: string; name: string; balance: number }
  device: 'desktop' | 'mobile'
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayLocal())
  const [actual, setActual] = useState(String(account.balance / 100))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [result, setResult] = useState<AccountReconcileResult | null>(null)

  const reset = () => {
    setDate(todayLocal())
    setActual(String(account.balance / 100))
    setNote('')
    setError('')
    setConflict(null)
    setResult(null)
  }

  const close = () => {
    setOpen(false)
    reset()
  }

  const submit = async (mode?: ReconcileMode) => {
    const parsed = Number(actual)
    if (!Number.isFinite(parsed)) {
      setError('真实余额必须是数字')
      return
    }
    setBusy(true)
    setError('')
    setConflict(null)
    try {
      const data = await accountApi
        .reconcile(account.id, {
          date,
          actualBalance: minor(Math.round(parsed * 100)),
          note: note.trim() || undefined,
          mode,
        })
        .then(unwrapApiData)
      setResult(data)
      onDone()
    } catch (requestError) {
      const details =
        requestError instanceof ApiClientError && typeof requestError.details === 'object'
          ? (requestError.details as Record<string, unknown>)
          : null
      if (details?.code === 'RECONCILE_CONFLICT') {
        setConflict({
          existingAmount: Number(details.existingAmount ?? 0),
          existingTransactionId: String(details.existingTransactionId ?? ''),
        })
      } else {
        setError(getApiErrorMessage(requestError))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <HfButton
        className="mb-set-textbtn"
        onClick={(event) => {
          event.stopPropagation()
          reset()
          setOpen(true)
        }}
      >
        对账
      </HfButton>
      <HfSheet variant="settings" device={device} opened={open} onClose={close}>
        <div className="mb-set-sheet-head">
          <h2 className="mb-set-sheet-title">对账「{account.name}」</h2>
          <HfButton className="mb-set-icon-btn" aria-label="关闭" onClick={close}>
            <X size={18} />
          </HfButton>
        </div>
        <div className="mb-set-sheet-body">
          <p className="mb-set-hint">
            填入该日期结束时的真实余额，系统按流水推导账面值并生成一条可见平账记录。平账只修正账户余额，
            不计入收支与预算。
          </p>
          <label className="mb-set-field">
            <span className="mb-set-label">对账日期</span>
            <input
              className="mb-set-input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="mb-set-field">
            <span className="mb-set-label">真实余额（元）</span>
            <input
              className="mb-set-input"
              inputMode="decimal"
              value={actual}
              onChange={(event) => setActual(event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="mb-set-field">
            <span className="mb-set-label">备注（可选）</span>
            <input
              className="mb-set-input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="如「银行 App 显示」"
            />
          </label>

          {conflict && (
            <div className="mb-set-hint is-warning" role="alert">
              <p>
                该账户当日已有一条平账记录（{formatCurrency(minor(conflict.existingAmount), { showSign: true })}）。
                请选择覆盖或追加：
              </p>
              <div className="mb-set-order-actions">
                <HfButton
                  className="mb-set-btn is-primary is-small"
                  disabled={busy}
                  onClick={() => void submit('overwrite')}
                >
                  覆盖（推荐）
                </HfButton>
                <HfButton
                  className="mb-set-btn is-ghost is-small"
                  disabled={busy}
                  onClick={() => void submit('append')}
                >
                  追加
                </HfButton>
              </div>
            </div>
          )}

          {result && (
            <p className="mb-set-hint" role="status">
              {result.status === 'balanced'
                ? '账面已与真实余额一致，无需生成平账记录。'
                : `${result.status === 'overwritten' ? '已覆盖' : result.status === 'appended' ? '已追加' : '已生成'}平账记录：差额 ${formatCurrency(
                    minor(result.difference),
                    { showSign: true },
                  )}（账面 ${formatCurrency(minor(result.bookBalance))} → 实际 ${formatCurrency(
                    minor(result.actualBalance),
                  )}）。`}
            </p>
          )}

          {error && (
            <p className="mb-tx-form-error" role="alert">
              {error}
            </p>
          )}

          {!conflict && !result && (
            <div className="mb-set-sheet-actions">
              <HfButton className="mb-set-btn is-ghost" onClick={close}>
                取消
              </HfButton>
              <HfButton
                className="mb-set-btn is-primary"
                disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
                onClick={() => void submit()}
              >
                {busy ? '处理中…' : '生成平账记录'}
              </HfButton>
            </div>
          )}
        </div>
      </HfSheet>
    </>
  )
}
