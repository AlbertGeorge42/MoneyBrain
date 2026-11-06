import { Drawer } from '@mantine/core'
import { RotateCcw } from 'lucide-react'
import { getCategoryName, type Ledger } from '@/features/overview/model'
import type { DeviceMode } from '@/features/shared/types'
import { applyDateFilter, type AdvancedFilters } from './filters'

function FilterFields({
  ledger,
  value,
  onChange,
}: {
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
              {account.name}
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

      <label className="mb-tx-field" htmlFor="mb-tx-filter-date-from">
        <span className="mb-tx-field-label">日期（留空不限）</span>
        <span className="mb-tx-range">
          <input
            id="mb-tx-filter-date-from"
            className="mb-tx-input"
            type="date"
            aria-label="起始日期（留空不限）"
            value={value.dateFrom}
            onChange={(event) => onChange(applyDateFilter(value, 'dateFrom', event.target.value))}
          />
          <span className="mb-tx-range-sep" aria-hidden="true">–</span>
          <input
            aria-label="结束日期（留空不限）"
            className="mb-tx-input"
            type="date"
            value={value.dateTo}
            onChange={(event) => onChange(applyDateFilter(value, 'dateTo', event.target.value))}
          />
        </span>
      </label>
    </div>
  )
}

export function DesktopFilterPanel({
  ledger,
  value,
  onChange,
  onReset,
  onClose,
}: {
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
      <FilterFields ledger={ledger} value={value} onChange={onChange} />
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
  ledger,
  value,
  onChange,
  onReset,
  onClose,
}: {
  opened: boolean
  device: DeviceMode
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
      <FilterFields ledger={ledger} value={value} onChange={onChange} />
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

