import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import { RotateCcw } from 'lucide-react'
import { getCategoryName, type Ledger } from '@/features/overview/model'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import { DatePicker } from '@/features/shared/datePicker/DatePicker'
import { datePresets } from '@/features/shared/datePicker/datePickerModel'
import type { DeviceMode } from '@/features/shared/types'
import { accountIdsInGroup, type AdvancedFilters } from './filters'

function FilterFields({
  device,
  today,
  ledger,
  value,
  onChange,
}: {
  device: DeviceMode
  today: string
  ledger: Ledger
  value: AdvancedFilters
  onChange: (next: AdvancedFilters) => void
}) {
  const update = (key: keyof AdvancedFilters, next: string | string[]) =>
    onChange({ ...value, [key]: next })
  const roots = ledger.categories.filter((category) => !category.parentId)
  const groups = ledger.accountCategories ?? []
  const groupById = new Map(groups.map((group) => [group.id, group]))
  const groupLabel = (group: (typeof groups)[number]) => {
    const parent = group.parentId ? groupById.get(group.parentId) : undefined
    const duplicated = groups.filter(
      (item) => item.name === group.name && item.parentId === group.parentId,
    ).length > 1
    return `${group.type === 'liability' ? '负债' : '资产'} · ${parent ? `${parent.name} · ` : ''}${
      group.name
    }${duplicated ? ` · #${group.id.slice(-4)}` : ''}`
  }
  const visibleAccounts = value.groupId
    ? ledger.accounts.filter((account) => accountIdsInGroup(ledger, value.groupId).includes(account.id))
    : ledger.accounts

  return (
    <div className="mb-tx-filter-fields">
      {groups.length > 0 && (
        <label className="mb-tx-field" htmlFor="mb-tx-filter-group">
          <span className="mb-tx-field-label">账户分组</span>
          <select
            id="mb-tx-filter-group"
            className="mb-tx-select"
            value={value.groupId}
            onChange={(event) => {
              const groupId = event.target.value
              // 分组与账户是同一维度：换分组时，若原账户不属于新分组就清空，避免组合成空集。
              const nextAccounts = groupId
                ? ledger.accounts.filter((account) => accountIdsInGroup(ledger, groupId).includes(account.id))
                : ledger.accounts
              const keepAccount =
                value.accountId === '' ||
                nextAccounts.some((account) => account.id === value.accountId)
              onChange({
                ...value,
                groupId,
                accountId: keepAccount ? value.accountId : '',
              })
            }}
          >
            <option value="">全部分组</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {groupLabel(group)}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mb-tx-field" htmlFor="mb-tx-filter-account">
        <span className="mb-tx-field-label">账户</span>
        <select
          id="mb-tx-filter-account"
          className="mb-tx-select"
          value={value.accountId}
          onChange={(event) => update('accountId', event.target.value)}
        >
          <option value="">全部账户</option>
          {visibleAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountDisplayName(account, ledger.accounts)}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-tx-field" htmlFor="mb-tx-filter-category">
        <span className="mb-tx-field-label">分类</span>
        <select
          id="mb-tx-filter-category"
          className="mb-tx-select"
          value={value.categoryId}
          onChange={(event) => update('categoryId', event.target.value)}
        >
          <option value="">全部分类</option>
          {roots.map((category) => (
            <option key={category.id} value={category.id}>
              {getCategoryName(ledger, category.id)}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-tx-field" htmlFor="mb-tx-filter-amount-min">
        <span className="mb-tx-field-label">金额（元）</span>
        <span className="mb-tx-range">
          <input
            id="mb-tx-filter-amount-min"
            className="mb-tx-input"
            type="number"
            min={0}
            inputMode="decimal"
            placeholder="最小"
            value={value.amountMin}
            onChange={(event) => update('amountMin', event.target.value)}
          />
          <span className="mb-tx-range-sep" aria-hidden="true">–</span>
          <input
            aria-label="金额上限"
            className="mb-tx-input"
            type="number"
            min={0}
            inputMode="decimal"
            placeholder="最大"
            value={value.amountMax}
            onChange={(event) => update('amountMax', event.target.value)}
          />
        </span>
      </label>

      <div className="mb-tx-field">
        <span className="mb-tx-field-label">日期（留空不限）</span>
        <DatePicker
          device={device}
          value={{ from: value.dateFrom, to: value.dateTo }}
          onChange={(next) => onChange({ ...value, dateFrom: next.from, dateTo: next.to })}
          optional
          placeholder="不限"
          presets={datePresets(today)}
          today={today}
          align="right"
          sheetTitle="选择日期（留空不限）"
        />
      </div>
    </div>
  )
}

export function DesktopFilterPanel({
  device,
  today,
  ledger,
  value,
  onChange,
  onReset,
  onClose,
}: {
  device: DeviceMode
  today: string
  ledger: Ledger
  value: AdvancedFilters
  onChange: (next: AdvancedFilters) => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <div className="mb-tx-filter-panel" id="mb-tx-filter-panel">
      <div className="mb-tx-filter-head">
        <span className="mb-tx-filter-title">高级筛选</span>
      </div>
      <FilterFields device={device} today={today} ledger={ledger} value={value} onChange={onChange} />
      <div className="mb-tx-filter-actions">
        <HfButton className="mb-tx-btn is-ghost" onClick={onReset}>
          <RotateCcw size={15} />
          重置条件
        </HfButton>
        <HfButton className="mb-tx-btn" onClick={onClose}>
          收起
        </HfButton>
      </div>
    </div>
  )
}

export function MobileFilterDrawer({
  opened,
  device,
  today,
  ledger,
  value,
  onChange,
  onReset,
  onClose,
}: {
  opened: boolean
  device: DeviceMode
  today: string
  ledger: Ledger
  value: AdvancedFilters
  onChange: (next: AdvancedFilters) => void
  onReset: () => void
  onClose: () => void
}) {
  if (device !== 'mobile') return null

  return (
    <HfSheet
      variant="transaction"
      device={device}
      opened={opened}
      onClose={onClose}
      title="高级筛选"
      actions={
        <>
          <HfButton
            className="mb-tx-btn is-ghost"
            onClick={() => {
              onReset()
              onClose()
            }}
          >
            重置条件
          </HfButton>
          <HfButton className="mb-tx-btn is-primary" onClick={onClose}>
            完成
          </HfButton>
        </>
      }
    >
      <FilterFields device={device} today={today} ledger={ledger} value={value} onChange={onChange} />
    </HfSheet>
  )
}

