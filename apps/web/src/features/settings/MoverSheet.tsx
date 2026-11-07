/**
 * 「移动到…」抽屉：账户换分组、分类换父级、现金流分类换活动组。
 * 选项全部由账本与当前目标派生，选择后由页面执行移动。
 */
import { X } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import type { Ledger, TxType } from '@/features/overview/model'
import { ACTIVITY_GROUPS, categoryDescendantIds, type ActivityGroupId } from './settingsModel'

export type Mover =
  | {
      kind: 'account'
      id: string
      name: string
      current: string | null
      type: 'asset' | 'liability'
    }
  | {
      kind: 'category'
      id: string
      name: string
      type: TxType
      currentParentId: string | null
    }
  | { kind: 'activity'; id: string; name: string; current: ActivityGroupId }

export function MoverSheet({
  mover,
  device,
  ledger,
  error,
  saving,
  onClose,
  onMove,
}: {
  mover: Mover | null
  device: DeviceMode
  ledger: Ledger
  error: string | null
  saving: boolean
  onClose: () => void
  onMove: (target: string) => void
}) {
  if (!mover) return null

  const options: { id: string; label: string; current: boolean }[] =
    mover.kind === 'account'
      ? (() => {
          const groups = (ledger.accountCategories ?? []).filter(
            (category) => category.type === mover.type,
          )
          return [
            { id: '', label: '未分组', current: mover.current === null },
            ...groups.map((category) => {
              const duplicated = groups.filter((other) => other.name === category.name).length > 1
              return {
                id: category.id,
                label: `${category.name}${duplicated ? ` · #${category.id.slice(-4)}` : ''}`,
                current: category.id === mover.current,
              }
            }),
          ]
        })()
      : mover.kind === 'activity'
        ? ACTIVITY_GROUPS.map((group) => ({
            id: group.id,
            label: group.label,
            current: group.id === mover.current,
          }))
        : [
            { id: 'root', label: '顶层（无父级）', current: mover.currentParentId === null },
            ...ledger.categories
              .filter(
                (category) =>
                  category.type === mover.type &&
                  !category.parentId &&
                  category.id !== mover.id &&
                  !categoryDescendantIds(ledger, mover.id).includes(category.id),
              )
              .map((category) => ({ id: category.id, label: category.name, current: false })),
          ]

  return (
    <HfSheet variant="settings" device={device} opened onClose={onClose} desktopSize={380}>
      <div className="mb-set-sheet-head">
        <h2 className="mb-set-sheet-title">移动「{mover.name}」到…</h2>
        <HfButton className="mb-set-icon-btn" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </HfButton>
      </div>
      <div className="mb-set-sheet-body">
        <div className="mb-set-radio-list" role="radiogroup" aria-label="目标位置">
          {options.map((option) => (
            <HfButton
              key={option.id}
              role="radio"
              aria-checked={option.current}
              className={option.current ? 'mb-set-radio is-current' : 'mb-set-radio'}
              disabled={option.current || saving}
              onClick={() => onMove(option.id)}
            >
              <span className="mb-set-radio-dot" aria-hidden="true" />
              <span>{option.label}</span>
              {option.current && <span className="mb-set-radio-now">当前</span>}
            </HfButton>
          ))}
        </div>
        {error && <p className="mb-tx-form-error" role="alert">{error}</p>}
      </div>
    </HfSheet>
  )
}
