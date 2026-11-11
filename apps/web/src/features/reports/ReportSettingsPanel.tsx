/**
 * 报表设置：当前报表的展示配置 + 对应的分类管理入口
 *
 * 打开设置就是「这张报表怎么显示」：分组口径、列集合、活动分组、目标比例与快照期间。
 * 每个报表只暴露它真正依赖的分类管理入口（资产负债→账户分类、收支明细→收支分类、
 * 现金流→现金流分类、投资→投资账户），不堆其他报表的设置。
 * 展示偏好只改当前 draft，页面即时按 draft 重算；确认后才落 localStorage。
 */
import type { ReactNode } from 'react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import { HfSwitch } from '@/features/shared/HfSwitch'
import type { DeviceMode } from '@/features/shared/types'
import type { LedgerConfigTab } from '@/features/ledger-config/LedgerConfigManager'
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

/** 每张报表真正依赖的分类管理入口：只有这一个，不列其他报表的。 */
const TAB_LEDGER: Record<
  ReportTab,
  { title: string; hint: string; tab: LedgerConfigTab }
> = {
  balance: {
    title: '账户分类',
    hint: '资产负债按账户分类分行，改分类名会直接改表里的行名。',
    tab: 'accounts',
  },
  flow: {
    title: '收支分类',
    hint: '收支明细按收支分类聚合，改分类会改变这里的构成。',
    tab: 'categories',
  },
  cash: {
    title: '现金流分类',
    hint: '现金流按分类的活动归属分组，改归属会改变这里的分组。',
    tab: 'cashflow',
  },
  invest: {
    title: '投资账户',
    hint: '投资分析只统计标记为「投资资产」的账户，改账户分组会改变口径。',
    tab: 'accounts',
  },
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
  onOpenLedger,
}: {
  tab: ReportTab
  draft: ReportViewSettings
  onChange: (next: ReportViewSettings) => void
  cashPresence: Record<CashGroupKey, boolean>
  /** 打开这张报表对应的分类管理抽屉。 */
  onOpenLedger: (tab: LedgerConfigTab) => void
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
  const ledger = TAB_LEDGER[tab]

  return (
    <div className="mb-rp-config">
      <div className="mb-rp-config-head">
        <div>
          <h3 className="mb-rp-config-title">{TAB_LABEL[tab]}设置</h3>
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

      {/* 分类管理：这张报表只依赖这一类分类，给一个直达入口就够。 */}
      <Field label={ledger.title} note={ledger.hint}>
        <HfButton
          className="mb-rp-btn is-ghost"
          onClick={() => onOpenLedger(ledger.tab)}
        >
          管理{ledger.title}
        </HfButton>
      </Field>
    </div>
  )
}

/**
 * 报表设置抽屉：外壳、标题与底部动作区都在这里，页面只负责 draft 状态与提交。
 * 打开即是当前报表的设置；数据范围开关即时生效，不参与 draft。
 */
export function ReportSettingsSheet({
  device,
  opened,
  onClose,
  tab,
  draftSettings,
  cashPresence,
  onOpenLedger,
  includeExcluded,
  onIncludeExcludedChange,
  onChange,
  onReset,
  onCommit,
}: {
  device: DeviceMode
  opened: boolean
  onClose: () => void
  /** 当前报表页签：设置只针对这张报表。 */
  tab: ReportTab
  draftSettings: ReportViewSettings | null
  cashPresence: Record<CashGroupKey, boolean>
  /** 打开这张报表对应的分类管理抽屉。 */
  onOpenLedger: (tab: LedgerConfigTab) => void
  /** 数据范围：是否把「不计收支」流水并入收支明细口径。 */
  includeExcluded: boolean
  onIncludeExcludedChange: (next: boolean) => void
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
        <>
          <HfButton className="mb-rp-btn is-ghost" onClick={onReset}>
            重置
          </HfButton>
          <HfButton className="mb-rp-btn is-ghost" onClick={onClose}>
            取消
          </HfButton>
          <HfButton className="mb-rp-btn is-primary" onClick={onCommit}>
            确认
          </HfButton>
        </>
      }
      actionsClassName="is-config"
    >
      <div className="mb-rp-settings">
        <div className="mb-rp-settings-scroll">
          {draftSettings && (
            <ReportConfigPanel
              tab={tab}
              draft={draftSettings}
              onChange={onChange}
              cashPresence={cashPresence}
              onOpenLedger={onOpenLedger}
            />
          )}
          {/* 数据范围只影响收支明细：只在收支明细这张报表的设置里出现。 */}
          {tab === 'flow' && (
            <>
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
            </>
          )}
        </div>
      </div>
    </HfSheet>
  )
}

