import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import { SORT_OPTIONS, type DisplaySettings } from './displaySettings'

function Fields({
  value,
  onChange,
}: {
  value: DisplaySettings
  onChange: (next: DisplaySettings) => void
}) {
  return (
    <div className="mb-tx-display">
      <div className="mb-tx-display-block">
        <span className="mb-tx-field-label">显示列</span>
        <label className="mb-tx-switch">
          <input
            type="checkbox"
            checked={value.showNote}
            onChange={(event) => onChange({ ...value, showNote: event.target.checked })}
          />
          <span>备注</span>
        </label>
        <label className="mb-tx-switch">
          <input
            type="checkbox"
            checked={value.showAccount}
            onChange={(event) => onChange({ ...value, showAccount: event.target.checked })}
          />
          <span>账户</span>
        </label>
      </div>

      <div className="mb-tx-display-block">
        <span className="mb-tx-field-label">排序</span>
        <div className="mb-tx-sort-group" role="group" aria-label="排序方式">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === value.sort ? 'mb-tx-type is-active' : 'mb-tx-type'}
              aria-pressed={option.value === value.sort}
              onClick={() => onChange({ ...value, sort: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DesktopDisplayPanel({
  value,
  onChange,
  onReset,
  onClose,
}: {
  value: DisplaySettings
  onChange: (next: DisplaySettings) => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <div className="mb-tx-filter-panel" id="mb-tx-display-panel">
      <div className="mb-tx-filter-head">
        <span className="mb-tx-filter-title">显示</span>
      </div>
      <Fields value={value} onChange={onChange} />
      <div className="mb-tx-filter-actions">
        <button type="button" className="mb-tx-btn is-ghost" onClick={onReset}>
          恢复默认
        </button>
        <button type="button" className="mb-tx-btn" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}

export function MobileDisplayDrawer({
  opened,
  device,
  value,
  onChange,
  onReset,
  onClose,
}: {
  opened: boolean
  device: DeviceMode
  value: DisplaySettings
  onChange: (next: DisplaySettings) => void
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
      title="显示"
      actions={
        <>
          <button type="button" className="mb-tx-btn is-ghost" onClick={onReset}>
            恢复默认
          </button>
          <button type="button" className="mb-tx-btn is-primary" onClick={onClose}>
            完成
          </button>
        </>
      }
    >
      <Fields value={value} onChange={onChange} />
    </HfSheet>
  )
}
