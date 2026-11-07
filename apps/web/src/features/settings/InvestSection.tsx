/**
 * 设置 · 投资资产类型分区。
 *
 * 目标占比与报表页同一套演示口径；本轮只允许改目标占比，删除在持有资产时禁用。
 */
import { GripVertical, TrendingUp } from 'lucide-react'
import { RowMenu } from './RowMenu'
import type { InvestmentTypeRow } from './settingsModel'
import type { Editor } from './EditorSheet'

interface InvestSectionProps {
  rows: readonly InvestmentTypeRow[]
  menuOpen: string | null
  onMenuOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
  onOpenEditor: (editor: Editor) => void
}

export function InvestSection({
  rows,
  menuOpen,
  onMenuOpen,
  confirming,
  onConfirm,
  onOpenEditor,
}: InvestSectionProps) {
  return (
    <>
      <div className="mb-set-list">
        {rows.map((row) => (
          <div key={row.id} className="mb-set-row">
            <span className="mb-set-drag" aria-hidden="true">
              <GripVertical size={14} />
            </span>
            <span className="mb-set-icon">
              <TrendingUp size={16} />
            </span>
            <span className="mb-set-name">{row.name}</span>
            <span className="mb-set-meta">
              当前 {row.current}% · 目标 {row.target}% · {row.rebalance}
            </span>
            <RowMenu
              id={`invest-${row.id}`}
              openId={menuOpen}
              onOpen={onMenuOpen}
              confirming={confirming}
              onConfirm={onConfirm}
              items={[
                {
                  key: `invest-edit-${row.id}`,
                  label: '编辑',
                  onSelect: () => onOpenEditor({ kind: 'invest', id: row.id }),
                },
                {
                  key: `invest-del-${row.id}`,
                  label: '删除',
                  danger: true,
                  confirm: true,
                  disabled: true,
                  hint: '该类型仍持有资产，不能删除',
                  onSelect: () => undefined,
                },
              ]}
            />
          </div>
        ))}
      </div>
    </>
  )
}
