/**
 * 设置 · 列表显示分区。
 *
 * 列显隐与排序写回与流水页共用的 displaySettings；金额与分类列固定显示。
 */
import { GripVertical } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import {
  SORT_OPTIONS,
  type DisplaySettings,
} from '@/features/transactions/displaySettings'

interface DisplaySectionProps {
  display: DisplaySettings
  onChange: (patch: Partial<DisplaySettings>) => void
}

export function DisplaySection({ display, onChange }: DisplaySectionProps) {
  const columns: { key: 'showNote' | 'showAccount' | 'fixed'; label: string; desc?: string }[] = [
    { key: 'showNote', label: '备注列' },
    { key: 'showAccount', label: '账户列' },
    { key: 'fixed', label: '金额与分类', desc: '必需' },
  ]
  return (
    <>
      <div className="mb-set-list">
        {columns.map((column) => {
          const checked = column.key === 'fixed' ? true : display[column.key]
          return (
            <div key={column.key} className="mb-set-row">
              <span className="mb-set-drag" aria-hidden="true">
                <GripVertical size={14} />
              </span>
              <span className="mb-set-name">{column.label}</span>
              {column.desc && <span className="mb-set-meta">{column.desc}</span>}
              <label className="mb-set-check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={column.key === 'fixed'}
                  onChange={(event) => {
                    if (column.key === 'fixed') return
                    onChange({ [column.key]: event.target.checked })
                  }}
                />
                <span>显示</span>
              </label>
            </div>
          )
        })}
      </div>
      <div className="mb-set-subblock">
        <span className="mb-set-label">排序方式</span>
        <div className="mb-set-sort" role="radiogroup" aria-label="排序方式">
          {SORT_OPTIONS.map((option) => (
            <HfButton
              key={option.value}
              role="radio"
              aria-checked={display.sort === option.value}
              className={display.sort === option.value ? 'mb-set-kind is-active' : 'mb-set-kind'}
              onClick={() => onChange({ sort: option.value })}
            >
              {option.label}
            </HfButton>
          ))}
        </div>
      </div>
    </>
  )
}
