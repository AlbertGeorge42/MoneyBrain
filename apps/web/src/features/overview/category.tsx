import {
  ArrowLeftRight,
  Banknote,
  Clapperboard,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  MoreHorizontal,
  RotateCcw,
  ShoppingBag,
  Tag,
  TrainFront,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

const ROOT_ICONS: Record<string, LucideIcon> = {
  food: Utensils,
  traffic: TrainFront,
  home: House,
  shop: ShoppingBag,
  fun: Clapperboard,
  health: HeartPulse,
  edu: GraduationCap,
  other: MoreHorizontal,
  salary: Banknote,
  inv: TrendingUp,
  gift: Gift,
  refund: RotateCcw,
  move: ArrowLeftRight,
}

const ROOT_TONES: Record<string, string> = {
  food: 'cat-1',
  traffic: 'cat-2',
  home: 'cat-3',
  shop: 'cat-4',
  fun: 'cat-5',
  health: 'cat-6',
  edu: 'cat-2',
  other: 'cat-6',
  salary: 'cat-1',
  inv: 'cat-1',
  gift: 'cat-5',
  refund: 'cat-2',
  move: 'cat-2',
}

export function CategoryIcon({ rootId, size = 'sm' }: { rootId: string; size?: 'sm' | 'md' }) {
  const Icon = ROOT_ICONS[rootId] ?? Tag
  const tone = ROOT_TONES[rootId] ?? 'cat-6'
  return (
    <span className={`mb-cat-icon mb-tone-${tone} is-${size}`} aria-hidden="true">
      <Icon size={size === 'md' ? 18 : 15} strokeWidth={1.8} />
    </span>
  )
}
