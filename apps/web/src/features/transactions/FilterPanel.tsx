import { Button } from '@/features/shared/Button'
import { FieldLabel } from '@/features/shared/FieldLabel'
import { Sheet } from '@/features/shared/Sheet'
import { Switch } from '@/features/shared/Switch'
import { RotateCcw } from 'lucide-react'
import { getCategoryName, type Ledger } from '@/features/overview/model'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import { DatePicker } from '@/features/shared/datePicker/DatePicker'
import { datePresets } from '@/features/shared/datePicker/datePickerModel'
import type { DeviceMode } from '@/features/shared/types'
import type { AdvancedFilters } from './filters'

function FilterFields({
  device,
  today,
  ledger,
  value,
  onChange,
  includeExcluded,
  excludedCount,
  onIncludeExcludedChange,
}: {
  device: DeviceMode
  today: string
  ledger: Ledger
  value: AdvancedFilters
  onChange: (next: AdvancedFilters) => void
  includeExcluded: boolean
  excludedCount: number
  onIncludeExcludedChange: (next: boolean) => void
}) {
  const update = (key: keyof AdvancedFilters, next: string | string[]) =>
    onChange({ ...value, [key]: next })
  const roots = ledger.categories.filter((category) => !category.parentId)
  const groups = ledger.accountCategories ?? []
  const groupLabel = (group: (typeof groups)[number]) => {
    const duplicated = groups.filter((item) => item.name === group.name).length > 1
    return `${group.type === 'liability' ? '负债' : '资产'} · ${group.name}${
      duplicated ? ` · #${group.id.slice(-4)}` : ''
    }`
  }
  const visibleAccounts = value.groupId
    ? ledger.accounts.filter((account) => account.categoryId === value.groupId)
    : ledger.accounts

  return (
    <>
      <div className="mb-tx-filter-group">
        <span className="mb-tx-filter-group-title">筛选条件</span>
        <div className="mb-tx-filter-fields">
          {groups.length > 0 && (
            <label className="mb-tx-field" htmlFor="mb-tx-filter-group">
              <FieldLabel>账户分组</FieldLabel>
              <select
                id="mb-tx-filter-group"
                className="mb-shared-input mb-shared-input--select"
                value={value.groupId}
                onChange={(event) => {
                  const groupId = event.target.value
                  // 分组与账户是同一维度：换分组时，若原账户不属于新分组就清空，避免组合成空集。
                  const nextAccounts = groupId
                    ? ledger.accounts.filter((account) => account.categoryId === groupId)
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
            <FieldLabel>账户</FieldLabel>
            <select
              id="mb-tx-filter-account"
              className="mb-shared-input mb-shared-input--select"
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
            <FieldLabel>分类</FieldLabel>
            <select
              id="mb-tx-filter-category"
              className="mb-shared-input mb-shared-input--select"
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
            <FieldLabel>金额（元）</FieldLabel>
            <span className="mb-tx-range">
              <input
                id="mb-tx-filter-amount-min"
                className="mb-shared-input"
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
                className="mb-shared-input"
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
            <FieldLabel>日期（留空不限）</FieldLabel>
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
      </div>

      {/* 统计范围只改合计口径，不参与筛选条件、URL 与「重置条件」。 */}
      <div className="mb-tx-filter-scope">
        <span className="mb-tx-filter-group-title">统计范围</span>
        <Switch
          variant="toggle"
          text="含不计收支交易"
          stateText={includeExcluded ? '已含' : '不含'}
          checked={includeExcluded}
          onChange={onIncludeExcludedChange}
        />
        <p className="mb-tx-filter-hint">
          {excludedCount > 0
            ? `当前筛选结果含 ${excludedCount} 笔标记为「不计收支」的流水；${
                includeExcluded ? '已并入合计' : '默认不计入合计'
              }。只影响合计与笔数，不改变列表行。`
            : '当前筛选结果没有标记为「不计收支」的流水。只影响合计与笔数，不改变列表行。'}
        </p>
      </div>
    </>
  )
}

export function DesktopFilterPanel({
  device,
  today,
  ledger,
  value,
  onChange,
  includeExcluded,
  excludedCount,
  onIncludeExcludedChange,
  onReset,
  onClose,
}: {
  device: DeviceMode
  today: string
  ledger: Ledger
  value: AdvancedFilters
  onChange: (next: AdvancedFilters) => void
  includeExcluded: boolean
  excludedCount: number
  onIncludeExcludedChange: (next: boolean) => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <div className="mb-tx-filter-panel" id="mb-tx-filter-panel">
      <div className="mb-tx-filter-head">
        <span className="mb-tx-filter-title">高级筛选</span>
      </div>
      <FilterFields
        device={device}
        today={today}
        ledger={ledger}
        value={value}
        onChange={onChange}
        includeExcluded={includeExcluded}
        excludedCount={excludedCount}
        onIncludeExcludedChange={onIncludeExcludedChange}
      />
      <div className="mb-tx-filter-actions">
        <Button variant="ghost" onClick={onReset}>
          <RotateCcw size={15} />
          重置条件
        </Button>
        <Button variant="secondary" onClick={onClose}>
          收起
        </Button>
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
  includeExcluded,
  excludedCount,
  onIncludeExcludedChange,
  onReset,
  onClose,
}: {
  opened: boolean
  device: DeviceMode
  today: string
  ledger: Ledger
  value: AdvancedFilters
  onChange: (next: AdvancedFilters) => void
  includeExcluded: boolean
  excludedCount: number
  onIncludeExcludedChange: (next: boolean) => void
  onReset: () => void
  onClose: () => void
}) {
  if (device !== 'mobile') return null

  return (
    <Sheet
      variant="transaction"
      device={device}
      opened={opened}
      onClose={onClose}
      title="高级筛选"
      actions={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              onReset()
              onClose()
            }}
          >
            重置条件
          </Button>
          <Button variant="primary" onClick={onClose}>
            完成
          </Button>
        </>
      }
    >
      <FilterFields
        device={device}
        today={today}
        ledger={ledger}
        value={value}
        onChange={onChange}
        includeExcluded={includeExcluded}
        excludedCount={excludedCount}
        onIncludeExcludedChange={onIncludeExcludedChange}
      />
    </Sheet>
  )
}
