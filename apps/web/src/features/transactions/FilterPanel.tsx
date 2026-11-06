import { Drawer } from '@mantine/core'
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
}: {
  device: DeviceMode
  today: string
  ledger: Ledger
  value: AdvancedFilters
  onChange: (next: AdvancedFilters) => void
}) {
  const update = (key: keyof AdvancedFilters, next: string) => onChange({ ...value, [key]: next })
  const roots = ledger.categories.filter((category) => !category.parentId)

  return (
    <div className="mb-tx-filter-fields">
      <label className="mb-tx-field" htmlFor="mb-tx-filter-account">
        <span className="mb-tx-field-label">账户</span>
        <select
          id="mb-tx-filter-account"
          className="mb-tx-select"
          value={value.accountId}
          onChange={(event) => update('accountId', event.target.value)}
        >
          <option value="">全部账户</option>
          {ledger.accounts.map((account) => (
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
        <button type="button" className="mb-tx-btn is-ghost" onClick={onReset}>
          <RotateCcw size={15} />
          重置条件
        </button>
        <button type="button" className="mb-tx-btn" onClick={onClose}>
          收起
        </button>
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
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="auto"
      withinPortal={false}
      title="高级筛选"
      classNames={{
        content: 'mb-tx-sheet',
        header: 'mb-tx-sheet-head',
        title: 'mb-tx-sheet-title',
        body: 'mb-tx-sheet-body',
        overlay: 'mb-tx-overlay',
        close: 'mb-tx-sheet-close',
      }}
    >
      <FilterFields device={device} today={today} ledger={ledger} value={value} onChange={onChange} />
      <div className="mb-tx-filter-actions is-mobile">
        <button
          type="button"
          className="mb-tx-btn is-ghost"
          onClick={() => {
            onReset()
            onClose()
          }}
        >
          重置条件
        </button>
        <button type="button" className="mb-tx-btn is-primary" onClick={onClose}>
          完成
        </button>
      </div>
    </Drawer>
  )
}

