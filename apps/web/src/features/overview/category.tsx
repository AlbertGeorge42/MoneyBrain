import { resolveCategoryIcon } from './categoryIcons'

export function CategoryIcon({
  rootId,
  iconKey,
  size = 'sm',
}: {
  /** 按名称映射得到的根分类 key；用户设置 iconKey 时优先使用 iconKey。 */
  rootId: string
  iconKey?: string | null
  size?: 'sm' | 'md' | 'row'
}) {
  const { icon: Icon, tone } = resolveCategoryIcon(iconKey, rootId)
  return (
    <span className={`mb-shared-icon mb-tone-${tone} --${size}`} aria-hidden="true">
      <Icon size={size === 'sm' ? 15 : 18} strokeWidth={1.8} />
    </span>
  )
}
