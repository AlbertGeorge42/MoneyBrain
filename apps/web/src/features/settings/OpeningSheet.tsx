/**
 * 期初补录抽屉。
 *
 * 展示每个未设期初账户的余额 / 日期输入，并在保存后对比净资产前后值；
 * 输入值与保存状态由页面的期初流程持有。
 */
import type { Dispatch, SetStateAction } from 'react'
import { X } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import type { DeviceMode } from '@/features/shared/types'
import type { Ledger } from '@/features/overview/model'
import { todayLocal } from '@/features/overview/apiLedger'
import { formatCurrency } from '@/utils/format'
import { minor } from '@domain/index'
import type {
  OpeningResult,
  OpeningStep,
  OpeningValues,
} from './settingsData'

interface OpeningSheetProps {
  device: DeviceMode
  ledger: Ledger
  step: OpeningStep
  values: OpeningValues
  result: OpeningResult | null
  error: string | null
  saving: boolean
  onValuesChange: Dispatch<SetStateAction<OpeningValues>>
  onSkip: () => void
  onDone: () => void
  onSave: () => void
}

export function OpeningSheet({
  device,
  ledger,
  step,
  values,
  result,
  error,
  saving,
  onValuesChange,
  onSkip,
  onDone,
  onSave,
}: OpeningSheetProps) {
  return (
    <HfSheet
      variant="settings"
      device={device}
      opened
      onClose={() => {
        if (saving) return
        onSkip()
      }}
      desktopSize={460}
    >
      <div className="mb-set-sheet-head">
        <h2 className="mb-set-sheet-title">补充期初余额</h2>
        <HfButton
          className="mb-set-icon-btn"
          aria-label="关闭"
          disabled={saving}
          onClick={onSkip}
        >
          <X size={18} />
        </HfButton>
      </div>
      <div className="mb-set-sheet-body">
        <p className="mb-set-hint">
          当前有 {step.accounts.length} 个账户未设期初。期初余额 = 期初日期当天开始前的余额，当天交易照常计入；
          留空表示跳过该账户，余额只能由流水推导，可能不准。
        </p>
        {step.accounts.map((account) => {
          const value = values[account.id] ?? {
            amount: account.initialBalance !== 0 ? String(account.initialBalance / 100) : '',
            date: account.initialBalanceDate ?? todayLocal(),
          }
          const hasOpening = account.initialBalanceDate !== null || account.initialBalance !== 0
          return (
            <div className="mb-set-preview" key={account.id}>
              <div className="mb-set-preview-row">
                <span>{accountDisplayName(account, ledger.accounts)}</span>
                <b className={hasOpening ? '' : 'mb-set-warn'}>
                  {hasOpening ? `已设期初 ${account.initialBalanceDate ?? ''}` : '未设期初'}
                </b>
              </div>
              <label className="mb-set-field">
                <span className="mb-set-label">期初余额（元）</span>
                <input
                  className="mb-set-input"
                  inputMode="decimal"
                  value={value.amount}
                  disabled={saving}
                  onChange={(event) =>
                    onValuesChange((current) => ({
                      ...current,
                      [account.id]: { ...value, amount: event.target.value },
                    }))
                  }
                />
              </label>
              <label className="mb-set-field">
                <span className="mb-set-label">期初余额日期</span>
                <input
                  className="mb-set-input"
                  type="date"
                  value={value.date}
                  disabled={saving}
                  onChange={(event) =>
                    onValuesChange((current) => ({
                      ...current,
                      [account.id]: { ...value, date: event.target.value },
                    }))
                  }
                />
              </label>
              <div className="mb-set-preview-row">
                <span>当前余额（balance-at）</span>
                <b>{formatCurrency(minor(account.balance))}</b>
              </div>
            </div>
          )
        })}
        {result && (
          <div className="mb-set-preview">
            <div className="mb-set-preview-row">
              <span>资产合计</span>
              <b>
                {formatCurrency(minor(result.before.assets))} →{' '}
                {formatCurrency(minor(result.after.assets))}
              </b>
            </div>
            <div className="mb-set-preview-row">
              <span>负债合计</span>
              <b>
                {formatCurrency(minor(result.before.liabilities))} →{' '}
                {formatCurrency(minor(result.after.liabilities))}
              </b>
            </div>
            <div className="mb-set-preview-row">
              <span>净资产</span>
              <b>
                {formatCurrency(minor(result.before.net))} →{' '}
                {formatCurrency(minor(result.after.net))}（
                {result.after.net - result.before.net >= 0 ? '+' : ''}
                {formatCurrency(minor(result.after.net - result.before.net))}）
              </b>
            </div>
          </div>
        )}
        {error && (
          <p className="mb-set-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="mb-set-sheet-actions">
        <HfButton className="mb-set-btn is-ghost" disabled={saving} onClick={onSkip}>
          跳过补录
        </HfButton>
        {result ? (
          <HfButton className="mb-set-btn is-primary" onClick={onDone}>
            完成
          </HfButton>
        ) : (
          <HfButton className="mb-set-btn is-primary" disabled={saving} onClick={onSave}>
            {saving ? '保存中…' : '保存期初'}
          </HfButton>
        )}
      </div>
    </HfSheet>
  )
}
