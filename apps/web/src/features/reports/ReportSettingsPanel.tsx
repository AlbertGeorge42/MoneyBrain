/**
 * 报表设置里的四个「配置」面板
 *
 * 只做展示偏好：分组口径、列集合、活动分组、目标比例与快照期间。
 * 每个切换只改当前这份 draft，页面即时按 draft 重算；确认后才落 localStorage。
 */
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { ReportTab } from './reportsTime'
import {
  CASH_GROUP_KEYS,
  type CashGroupKey,
  type ReportViewSettings,
} from './reportSettings'

const TAB_LABEL: Record<ReportTab, string> = {
  balance: '资产负债',
  flow: '收支明细',
  cash: '现金流',
  invest: '投资分析',
}

const CASH_REASON: Record<CashGroupKey, string> = {
  经营: '本期无经营活动流水',
  投资: '本期无投资活动流水',
  筹资: '本期无筹资活动流水',
  未分类: '本期无未分类流水',
  账户间转账: '本期无账户间转账',
}

function Field({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: ReactNode
}) {
  return (
    <div className="mb-rp-config-field">
      <p className="mb-rp-config-label">{label}</p>
      {note && <p className="mb-rp-config-field-note">{note}</p>}
      {children}
    </div>
  )
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  note,
}: {
  label: string
  value: T
  options: readonly { id: T; label: string; disabled?: boolean; reason?: string }[]
  onChange: (next: T) => void
  note?: string
}) {
  const disabledReason = options.find((option) => option.disabled)?.reason
  return (
    <Field label={label} note={note}>
      <div className="mb-rp-config-choices" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.id)}
            type="button"
            className={option.id === value ? 'mb-rp-config-choice is-active' : 'mb-rp-config-choice'}
            aria-pressed={option.id === value}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {disabledReason && <p className="mb-rp-config-reason">{disabledReason}</p>}
    </Field>
  )
}

function Toggle({
  label,
  checked,
  disabled,
  reason,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  reason?: string
  onChange: (next: boolean) => void
}) {
  return (
    <div className="mb-rp-config-toggle-wrap">
      <button
        type="button"
        className={checked ? 'mb-rp-config-toggle is-on' : 'mb-rp-config-toggle'}
        aria-pressed={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span>{label}</span>
        <span className="mb-rp-config-toggle-state">{checked ? '显示' : '隐藏'}</span>
      </button>
      {disabled && reason && <p className="mb-rp-config-reason">{reason}</p>}
    </div>
  )
}

export function ReportConfigPanel({
  tab,
  draft,
  onChange,
  cashPresence,
  onBack,
}: {
  tab: ReportTab
  draft: ReportViewSettings
  onChange: (next: ReportViewSettings) => void
  cashPresence: Record<CashGroupKey, boolean>
  onBack: () => void
}) {
  const patchBalance = (patch: Partial<ReportViewSettings['balance']>) =>
    onChange({ ...draft, balance: { ...draft.balance, ...patch } })
  const patchFlow = (patch: Partial<ReportViewSettings['flow']>) =>
    onChange({ ...draft, flow: { ...draft.flow, ...patch } })
  const patchCash = (patch: Partial<ReportViewSettings['cash']['groups']>) =>
    onChange({ ...draft, cash: { ...draft.cash, groups: { ...draft.cash.groups, ...patch } } })
  const patchInvest = (patch: Partial<ReportViewSettings['invest']>) =>
    onChange({ ...draft, invest: { ...draft.invest, ...patch } })

  const groupedByKind = draft.balance.groupMode === 'kind'

  return (
    <div className="mb-rp-config">
      <div className="mb-rp-config-head">
        <button type="button" className="mb-rp-config-back" aria-label="返回报表设置" onClick={onBack}>
          <ChevronLeft size={18} />
        </button>
        <div>
          <h3 className="mb-rp-config-title">{TAB_LABEL[tab]}配置</h3>
          <p className="mb-rp-config-note">只改展示口径 · 不写回账本</p>
        </div>
      </div>

      {tab === 'balance' && (
        <>
          <Choice
            label="分组口径"
            value={draft.balance.groupMode}
            options={[
              { id: 'account', label: '按账户' },
              { id: 'kind', label: '按性质汇总' },
            ]}
            onChange={(next) => patchBalance({ groupMode: next })}
            note="表与「资产构成」环同一口径：按性质汇总时环按性质切块，按账户时环按账户切块。"
          />
          <Field label="列显示">
            <Toggle
              label="性质列"
              checked={draft.balance.showKindColumn && !groupedByKind}
              disabled={groupedByKind}
              reason="已按性质汇总，性质列不再单列"
              onChange={(next) => patchBalance({ showKindColumn: next })}
            />
          </Field>
        </>
      )}

      {tab === 'flow' && (
        <>
          <Choice
            label="构成图具名类别"
            value={draft.flow.namedCategories}
            options={[
              { id: 6, label: '6 类' },
              { id: 5, label: '5 类' },
            ]}
            onChange={(next) => patchFlow({ namedCategories: next })}
            note="最多 6 类具名，其余小类合并为「其余 N 类」；不影响合计。"
          />
          <Field label="列显示" note="金额列固定保留。">
            <Toggle
              label="笔数"
              checked={draft.flow.showCountColumn}
              onChange={(next) => patchFlow({ showCountColumn: next })}
            />
            <Toggle
              label="占比"
              checked={draft.flow.showShareColumn}
              onChange={(next) => patchFlow({ showShareColumn: next })}
            />
          </Field>
        </>
      )}

      {tab === 'cash' && (
        <Field label="分组显示" note="只影响流入 / 流出表与构成条，合计随可见分组重算。">
          {CASH_GROUP_KEYS.map((key) => (
            <Toggle
              key={key}
              label={key}
              checked={draft.cash.groups[key]}
              disabled={!cashPresence[key]}
              reason={CASH_REASON[key]}
              onChange={(next) => patchCash({ [key]: next })}
            />
          ))}
        </Field>
      )}

      {tab === 'invest' && (
        <>
          <Field label="资产分布">
            <Toggle
              label="目标比例"
              checked={draft.invest.showTarget}
              onChange={(next) => patchInvest({ showTarget: next })}
            />
          </Field>
          <Field label="持仓排序" note="只改行序，不改持仓金额。">
            <div className="mb-rp-config-choices" role="group" aria-label="持仓排序">
              <button
                type="button"
                className={draft.invest.sortBy === 'marketValue' ? 'mb-rp-config-choice is-active' : 'mb-rp-config-choice'}
                aria-pressed={draft.invest.sortBy === 'marketValue'}
                onClick={() => patchInvest({ sortBy: 'marketValue' })}
              >
                市值
              </button>
              <button
                type="button"
                className={draft.invest.sortBy === 'rate' ? 'mb-rp-config-choice is-active' : 'mb-rp-config-choice'}
                aria-pressed={draft.invest.sortBy === 'rate'}
                onClick={() => patchInvest({ sortBy: 'rate' })}
              >
                收益率
              </button>
              <button type="button" className="mb-rp-config-choice" disabled>
                成本
              </button>
            </div>
            <p className="mb-rp-config-reason">成本为测算值，不作为排序依据</p>
          </Field>
          <Choice
            label="快照期间"
            value={draft.invest.snapshotCount}
            options={[
              { id: 6, label: '近 6 期' },
              { id: 3, label: '近 3 期' },
            ]}
            onChange={(next) => patchInvest({ snapshotCount: next })}
          />
        </>
      )}
    </div>
  )
}
