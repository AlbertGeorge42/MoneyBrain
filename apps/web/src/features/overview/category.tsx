import { resolveCategoryIcon } from './categoryIcons'

export function CategoryIcon({
  iconKey,
  size = 'sm',
}: {
  iconKey?: string | null
  size?: 'sm' | 'md' | 'row'
}) {
  const { icon: Icon, tone } = resolveCategoryIcon(iconKey)
  return (
    <span className={`mb-shared-icon mb-tone-${tone} --${size}`} aria-hidden="true">
      <Icon size={size === 'sm' ? 15 : 18} strokeWidth={1.8} />
    </span>
  )
}
