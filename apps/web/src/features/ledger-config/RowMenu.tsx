/**
 * 配置行尾「⋯」菜单：分隔项、危险项、二次确认与禁用提示。
 * 开关状态（openId / confirming）由页面统一持有，保证同一时间只开一个菜单。
 */
import { MoreHorizontal } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'

export interface MenuItem {
  label: string
  key: string
  danger?: boolean
  disabled?: boolean
  hint?: string
  /** 需要二次确认的操作：第一次点击变成「确认删除」，3 秒未确认自动复位。 */
  confirm?: boolean
  onSelect: () => void
}

export function RowMenu({
  id,
  items,
  openId,
  onOpen,
  confirming,
  onConfirm,
}: {
  id: string
  items: MenuItem[]
  openId: string | null
  onOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
}) {
  const open = openId === id
  return (
    <div className="mb-set-more-wrap">
      <HfButton
        className="mb-set-more"
        aria-label="更多操作"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onOpen(open ? null : id)}
      >
        <MoreHorizontal size={18} />
      </HfButton>
      {open && (
        <div className="mb-set-menu" role="menu">
          {items.map((item) => {
            const armed = item.confirm && confirming === item.key
            return (
              <HfButton
                key={item.key}
                role="menuitem"
                className={
                  armed || item.danger ? 'mb-set-menu-item is-danger' : 'mb-set-menu-item'
                }
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return
                  if (item.confirm && confirming !== item.key) {
                    onConfirm(item.key)
                    return
                  }
                  onOpen(null)
                  item.onSelect()
                }}
              >
                <span>{armed ? '确认删除' : item.label}</span>
                {item.disabled && item.hint && (
                  <span className="mb-set-menu-hint">{item.hint}</span>
                )}
              </HfButton>
            )
          })}
        </div>
      )}
    </div>
  )
}
