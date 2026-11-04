import {
  Button,
  Checkbox,
  Collapse,
  Drawer,
  NumberInput,
  Select,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { Settings2, SlidersHorizontal, SquareCheckBig, Search, X } from 'lucide-react'
import type { RefObject } from 'react'
import type { ListDisplay } from './display-settings'
import { TYPE_LABELS, TYPE_OPTIONS, formatUnsigned } from './transaction-utils'
import type { Account, Category, DeviceMode, TransactionFilters } from './types'

type AdvancedFilterFieldsProps = {
  filters: TransactionFilters
  accounts: Account[]
  categories: Category[]
  onChange: (patch: Partial<TransactionFilters>) => void
  onReset: () => void
}

function toNullableNumber(value: string | number): number | null {
  if (value === '') return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function AdvancedFilterFields({ filters, accounts, categories, onChange, onReset }: AdvancedFilterFieldsProps) {
  return (
    <div className="tx-advanced">
      <Select
        label="账户"
        placeholder="全部账户"
        clearable
        value={filters.accountId}
        data={accounts.map((account) => ({ value: account.id, label: account.name }))}
        onChange={(value) => onChange({ accountId: value })}
      />
      <Select
        label="分类"
        placeholder="全部分类"
        clearable
        value={filters.categoryId}
        data={categories.map((category) => ({ value: category.id, label: category.name }))}
        onChange={(value) => onChange({ categoryId: value })}
      />
      <div className="tx-advanced-amount">
        <NumberInput
          label="金额"
          placeholder="最低"
          min={0}
          hideControls
          value={filters.min ?? ''}
          onChange={(value) => onChange({ min: toNullableNumber(value) })}
        />
        <NumberInput
          aria-label="最高金额"
          placeholder="最高"
          min={0}
          hideControls
          value={filters.max ?? ''}
          onChange={(value) => onChange({ max: toNullableNumber(value) })}
        />
      </div>
      <div className="tx-advanced-dates">
        <DatePickerInput
          label="起始日期"
          placeholder="不限"
          clearable
          valueFormat="YYYY-MM-DD"
          value={filters.from}
          onChange={(value) => onChange({ from: value })}
        />
        <DatePickerInput
          aria-label="结束日期"
          placeholder="不限"
          clearable
          valueFormat="YYYY-MM-DD"
          value={filters.to}
          onChange={(value) => onChange({ to: value })}
        />
      </div>
      <div className="tx-advanced-footer">
        <UnstyledButton className="tx-advanced-reset" onClick={onReset}>重置筛选</UnstyledButton>
      </div>
    </div>
  )
}

type ListDisplayFieldsProps = {
  display: ListDisplay
  onChange: (patch: Partial<ListDisplay>) => void
}

/** 「显示」面板的字段：PC 原地面板、移动端底部抽屉与设置页共用同一渲染器（T4）。 */
export function ListDisplayFields({ display, onChange }: ListDisplayFieldsProps) {
  return (
    <div className="tx-display-fields">
      <div className="tx-display-group" role="group" aria-label="列显示">
        <span className="mb-text-0 tx-display-label">列显示</span>
        <Checkbox
          label="账户"
          checked={display.account}
          onChange={(event) => onChange({ account: event.currentTarget.checked })}
        />
        <Checkbox
          label="类型"
          checked={display.type}
          onChange={(event) => onChange({ type: event.currentTarget.checked })}
        />
        <Checkbox
          label="备注"
          checked={display.note}
          onChange={(event) => onChange({ note: event.currentTarget.checked })}
        />
      </div>
      <div className="tx-display-group" role="group" aria-label="密度">
        <span className="mb-text-0 tx-display-label">密度</span>
        <UnstyledButton
          className="mb-chip"
          data-active={display.density === 'standard'}
          aria-pressed={display.density === 'standard'}
          onClick={() => onChange({ density: 'standard' })}
        >
          标准
        </UnstyledButton>
        <UnstyledButton
          className="mb-chip"
          data-active={display.density === 'compact'}
          aria-pressed={display.density === 'compact'}
          onClick={() => onChange({ density: 'compact' })}
        >
          紧凑
        </UnstyledButton>
      </div>
    </div>
  )
}

type TransactionsToolbarProps = {
  device: DeviceMode
  filters: TransactionFilters
  accounts: Account[]
  categories: Category[]
  searchInputRef: RefObject<HTMLInputElement>
  advancedOpen: boolean
  batchMode: boolean
  display: ListDisplay
  displayOpen: boolean
  onChange: (patch: Partial<TransactionFilters>) => void
  onChangeDisplay: (patch: Partial<ListDisplay>) => void
  onReset: () => void
  onToggleAdvanced: () => void
  onToggleBatch: () => void
  onToggleDisplay: () => void
}

export function TransactionsToolbar({
  device,
  filters,
  accounts,
  categories,
  searchInputRef,
  advancedOpen,
  batchMode,
  display,
  displayOpen,
  onChange,
  onChangeDisplay,
  onReset,
  onToggleAdvanced,
  onToggleBatch,
  onToggleDisplay,
}: TransactionsToolbarProps) {
  return (
    <div className={`tx-toolbar tx-toolbar--${device}`}>
      <div className="tx-toolbar-row">
        <TextInput
          ref={searchInputRef}
          className="tx-search"
          placeholder="搜索备注、账户、分类…"
          aria-label="搜索流水"
          leftSection={<Search aria-hidden />}
          value={filters.query}
          onChange={(event) => onChange({ query: event.currentTarget.value })}
        />
        <div className="tx-type-filter" role="group" aria-label="类型筛选">
          {TYPE_OPTIONS.map((option) => (
            <UnstyledButton
              key={option.value}
              className="mb-chip"
              data-active={filters.type === option.value}
              aria-pressed={filters.type === option.value}
              onClick={() => onChange({ type: option.value })}
            >
              {option.label}
            </UnstyledButton>
          ))}
        </div>
        <div className="tx-toolbar-actions">
          <UnstyledButton
            className="mb-chip"
            data-active={advancedOpen}
            aria-expanded={advancedOpen}
            onClick={onToggleAdvanced}
          >
            <SlidersHorizontal aria-hidden /> 高级筛选
          </UnstyledButton>
          <UnstyledButton
            className="mb-chip"
            data-active={batchMode}
            aria-pressed={batchMode}
            onClick={onToggleBatch}
          >
            <SquareCheckBig aria-hidden /> {batchMode ? '退出批量' : '批量'}
          </UnstyledButton>
          {device === 'pc' && (
            <UnstyledButton
              className="mb-chip"
              data-active={displayOpen}
              aria-expanded={displayOpen}
              onClick={onToggleDisplay}
            >
              <Settings2 aria-hidden /> 显示
            </UnstyledButton>
          )}
        </div>
      </div>

      {device === 'pc' && (
        <Collapse in={advancedOpen}>
          <div className="tx-advanced-panel">
            <AdvancedFilterFields
              filters={filters}
              accounts={accounts}
              categories={categories}
              onChange={onChange}
              onReset={onReset}
            />
          </div>
        </Collapse>
      )}

      {device === 'pc' && (
        <Collapse in={displayOpen}>
          <div className="tx-advanced-panel" aria-label="列表显示">
            <ListDisplayFields display={display} onChange={onChangeDisplay} />
          </div>
        </Collapse>
      )}

      {device === 'mobile' && (
        <Drawer
          opened={advancedOpen}
          onClose={onToggleAdvanced}
          position="bottom"
          size="auto"
          title="高级筛选"
        >
          <div className="tx-advanced-panel--mobile">
            <AdvancedFilterFields
              filters={filters}
              accounts={accounts}
              categories={categories}
              onChange={onChange}
              onReset={onReset}
            />
          </div>
          <Button className="mb-accent-btn" fullWidth mt="md" onClick={onToggleAdvanced}>
            查看结果
          </Button>
        </Drawer>
      )}
    </div>
  )
}

type ConditionChipsProps = {
  filters: TransactionFilters
  accounts: Account[]
  categories: Category[]
  onChange: (patch: Partial<TransactionFilters>) => void
  onReset: () => void
}

export function ConditionChips({ filters, accounts, categories, onChange, onReset }: ConditionChipsProps) {
  const chips: Array<{ key: string; label: string; clear: () => void }> = []

  if (filters.query.trim()) {
    chips.push({ key: 'query', label: `“${filters.query.trim()}”`, clear: () => onChange({ query: '' }) })
  }
  if (filters.type !== 'all') {
    chips.push({ key: 'type', label: TYPE_LABELS[filters.type], clear: () => onChange({ type: 'all' }) })
  }
  if (filters.accountId) {
    const account = accounts.find((item) => item.id === filters.accountId)
    chips.push({
      key: 'account',
      label: account?.name ?? filters.accountId,
      clear: () => onChange({ accountId: null }),
    })
  }
  if (filters.categoryId) {
    const category = categories.find((item) => item.id === filters.categoryId)
    chips.push({
      key: 'category',
      label: category?.name ?? filters.categoryId,
      clear: () => onChange({ categoryId: null }),
    })
  }
  if (filters.min !== null || filters.max !== null) {
    const label = `${filters.min !== null ? formatUnsigned(filters.min) : '不限'} – ${filters.max !== null ? formatUnsigned(filters.max) : '不限'}`
    chips.push({ key: 'amount', label, clear: () => onChange({ min: null, max: null }) })
  }
  if (filters.from || filters.to) {
    chips.push({
      key: 'date',
      label: `${filters.from ?? '不限'} – ${filters.to ?? '不限'}`,
      clear: () => onChange({ from: null, to: null }),
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="tx-conditions" aria-label="生效筛选条件">
      {chips.map((chip) => (
        <span key={chip.key} className="tx-condition">
          {chip.label}
          <button type="button" className="tx-condition-remove" aria-label={`移除条件：${chip.label}`} onClick={chip.clear}>
            <X aria-hidden />
          </button>
        </span>
      ))}
      <UnstyledButton className="tx-conditions-clear" onClick={onReset}>清除条件</UnstyledButton>
    </div>
  )
}
