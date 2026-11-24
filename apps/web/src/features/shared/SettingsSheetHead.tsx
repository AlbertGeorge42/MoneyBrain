/**
 * 设置族抽屉的统一头部：标题 + 关闭按钮。
 *
 * 分类删除 / 编辑 / 图标选择 / 移动、账本配置、清空 / 期初 / 导入共 8 个抽屉
 * 逐字重复同一段 head 骨架，收敛在此；文案、关闭回调与禁用态走 props，
 * 视觉 class 与 DOM 结构保持原样，样式仍由 settings.css 提供。
 */
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

export function SettingsSheetHead({
  title,
  onClose,
  disabled,
}: {
  title: ReactNode
  onClose: () => void
  disabled?: boolean
}) {
  return (
    <div className="mb-set-sheet-head">
      <h2 className="mb-set-sheet-title">{title}</h2>
      <IconButton size="sm" aria-label="关闭" disabled={disabled} onClick={onClose}>
        <X size={18} />
      </IconButton>
    </div>
  )
}
