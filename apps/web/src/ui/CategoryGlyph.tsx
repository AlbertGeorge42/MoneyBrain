import {
  ArrowLeftRight,
  Banknote,
  ChartLine,
  CirclePlus,
  CreditCard,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  MoreHorizontal,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  SlidersHorizontal,
  TrainFront,
  Utensils,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { CategoryIcon as CategoryIconName } from '../features/transactions/types'

const ICONS: Record<CategoryIconName, LucideIcon> = {
  utensils: Utensils,
  train: TrainFront,
  shopping: ShoppingBag,
  house: House,
  gamepad: Gamepad2,
  heart: HeartPulse,
  graduation: GraduationCap,
  more: MoreHorizontal,
  wallet: Wallet,
  gift: Gift,
  chart: ChartLine,
  receipt: ReceiptText,
  transfer: ArrowLeftRight,
  credit: CreditCard,
  plus: CirclePlus,
  banknote: Banknote,
  rotate: RotateCcw,
  sliders: SlidersHorizontal,
  wrench: Wrench,
}

type CategoryGlyphProps = {
  icon: CategoryIconName
  colorIndex: 1 | 2 | 3 | 4 | 5 | 6
  compact?: boolean
}

export function CategoryGlyph({ icon, colorIndex, compact = false }: CategoryGlyphProps) {
  const Icon = ICONS[icon]
  return (
    <span className={`mb-cat-icon cat-${colorIndex}${compact ? ' mb-cat-icon--compact' : ''}`} aria-hidden>
      <Icon />
    </span>
  )
}
