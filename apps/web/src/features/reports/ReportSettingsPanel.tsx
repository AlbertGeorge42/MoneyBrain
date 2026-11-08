/**
 * 报表设置：数据范围 + 四个「配置」面板
 *
 * 数据范围（是否并入「不计收支」）即时生效，与展示配置同存 localStorage；
 * 四个配置只做展示偏好：分组口径、列集合、活动分组、目标比例与快照期间。
 * 每个切换只改当前这份 draft，页面即时按 draft 重算；确认后才落 localStorage。
 */
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import { HfSwitch } from '@/features/shared/HfSwitch'
import type { DeviceMode } from '@/features/shared/types'
import { REPORT_TABS } from './reportsShared'
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
          <HfButton
            key={String(option.id)}
            className={option.id === value ? 'mb-rp-config-choice is-active' : 'mb-rp-config-choice'}
            aria-pressed={option.id === value}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </HfButton>
        ))}
      </div>
      {disabledReason && <p className="mb-rp-config-reason">{disabledReason}</p>}
    </Field>
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
        <HfButton className="mb-rp-config-back" aria-label="返回报表设置" onClick={onBack}>
          <ChevronLeft size={18} />
        </HfButton>
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
            <HfSwitch
              variant="toggle"
              text="性质列"
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
            <HfSwitch
              variant="toggle"
              text="笔数"
              checked={draft.flow.showCountColumn}
              onChange={(next) => patchFlow({ showCountColumn: next })}
            />
            <HfSwitch
              variant="toggle"
              text="占比"
              checked={draft.flow.showShareColumn}
              onChange={(next) => patchFlow({ showShareColumn: next })}
            />
          </Field>
        </>
      )}

      {tab === 'cash' && (
        <Field
          label="分组显示"
          note="表尾合计按可见分组重算；PC 桑基把隐藏项并入「其他（已隐藏 N 组）」以保持守恒，图与表合计允许不同；账户间转账为账户内部移动，画成账户间连线而非首尾节点。"
        >
          {CASH_GROUP_KEYS.map((key) => (
            <HfSwitch
              key={key}
              variant="toggle"
              text={key}
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
            <HfSwitch
              variant="toggle"
              text="目标比例"
              checked={draft.invest.showTarget}
              onChange={(next) => patchInvest({ showTarget: next })}
            />
          </Field>
          <Field label="持仓排序" note="只改行序，不改持仓金额。">
            <div className="mb-rp-config-choices" role="group" aria-label="持仓排序">
              <HfButton
                className={draft.invest.sortBy === 'marketValue' ? 'mb-rp-config-choice is-active' : 'mb-rp-config-choice'}
                aria-pressed={draft.invest.sortBy === 'marketValue'}
                onClick={() => patchInvest({ sortBy: 'marketValue' })}
              >
                市值
              </HfButton>
              <HfButton
                className={draft.invest.sortBy === 'rate' ? 'mb-rp-config-choice is-active' : 'mb-rp-config-choice'}
                aria-pressed={draft.invest.sortBy === 'rate'}
                onClick={() => patchInvest({ sortBy: 'rate' })}
              >
                收益率
              </HfButton>
              <HfButton className="mb-rp-config-choice" disabled>
                成本
              </HfButton>
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

/**
 * 报表设置抽屉：外壳、标题与底部动作区都在这里，页面只负责 draft 状态与提交。
 * 未进配置时列出四张报表；进入配置后动作区换成重置 / 取消 / 确认。
 */
export function ReportSettingsSheet({
  device,
  opened,
  onClose,
  configTab,
  draftSettings,
  cashPresence,
  onOpenConfig,
  onOpenLedger,
  includeExcluded,
  onIncludeExcludedChange,
  onBack,
  onChange,
  onReset,
  onCommit,
}: {
  device: DeviceMode
  opened: boolean
  onClose: () => void
  configTab: ReportTab | null
  draftSettings: ReportViewSettings | null
  cashPresence: Record<CashGroupKey, boolean>
  onOpenConfig: (tab: ReportTab) => void
  /** 账本数据入口：与设置页同源，保存立即生效。 */
  onOpenLedger: (tab: 'accounts' | 'categories') => void
  /** 数据范围：是否把「不计收支」流水并入收支明细口径。 */
  includeExcluded: boolean
  onIncludeExcludedChange: (next: boolean) => void
  onBack: () => void
  onChange: (next: ReportViewSettings) => void
  onReset: () => void
  onCommit: () => void
}) {
  return (
    <HfSheet
      variant="report"
      device={device}
      opened={opened}
      onClose={onClose}
      title="报表设置"
      contentClassName={device === 'mobile' ? 'mb-rp-sheet-settings is-mobile' : 'mb-rp-sheet-settings'}
      bodyClassName="is-settings"
      actions={
        configTab && draftSettings ? (
          <>
            <HfButton className="mb-rp-btn is-ghost" onClick={onReset}>
              重置
            </HfButton>
            <HfButton className="mb-rp-btn is-ghost" onClick={onBack}>
              取消
            </HfButton>
            <HfButton className="mb-rp-btn is-primary" onClick={onCommit}>
              确认
            </HfButton>
          </>
        ) : (
          <HfButton className="mb-rp-btn is-primary" onClick={onClose}>
            完成
          </HfButton>
        )
      }
      actionsClassName={configTab && draftSettings ? 'is-config' : undefined}
    >
      <div className="mb-rp-settings">
        <div className="mb-rp-settings-scroll">
          {configTab && draftSettings ? (
            <ReportConfigPanel
              tab={configTab}
              draft={draftSettings}
              onChange={onChange}
              cashPresence={cashPresence}
              onBack={onBack}
            />
          ) : (
            <>
              <p className="mb-rp-settings-note">展示配置只改口径 · 不写回账本</p>
              {REPORT_TABS.map((item) => (
                <div className="mb-rp-settings-row" key={item.id}>
                  <div>
                    <p className="mb-rp-settings-title">{item.label}</p>
                  </div>
                  <HfButton className="mb-rp-btn is-ghost" onClick={() => onOpenConfig(item.id)}>
                    配置
                  </HfButton>
                </div>
              ))}
              <p className="mb-rp-settings-note">数据范围 · 立即生效 · 与其他展示配置同存本地</p>
              <div className="mb-rp-settings-scope">
                <HfSwitch
                  variant="toggle"
                  text="含不计收支交易"
                  stateText={includeExcluded ? '已含' : '不含'}
                  checked={includeExcluded}
                  onChange={onIncludeExcludedChange}
                />
                <p className="mb-rp-config-reason">
                  开启后收支明细、指标与分类合计并入标记为「不计收支」的流水；不影响其他三张报表。
                </p>
              </div>
              <p className="mb-rp-settings-note">账本数据 · 与设置页同源 · 保存立即生效</p>
              <div className="mb-rp-settings-row">
                <div>
                  <p className="mb-rp-settings-title">账户与分组</p>
                </div>
                <HfButton className="mb-rp-btn is-ghost" onClick={() => onOpenLedger('accounts')}>
                  管理
                </HfButton>
              </div>
              <div className="mb-rp-settings-row">
                <div>
                  <p className="mb-rp-settings-title">收支分类</p>
                </div>
                <HfButton className="mb-rp-btn is-ghost" onClick={() => onOpenLedger('categories')}>
                  管理
                </HfButton>
              </div>
            </>
          )}
        </div>
      </div>
    </HfSheet>
  )
}

