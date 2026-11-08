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
import type { CategoryIconKey } from '@contracts/constants'

export interface CategoryIconOption {
  key: CategoryIconKey
  label: string
  icon: LucideIcon
  tone: string
}

/**
 * 分类图标注册表：键值必须与契约里的 CATEGORY_ICON_KEYS 一一对应。
 *
 * 图标组件、名称回退映射、设置页选择器都从这一份注册表取，避免多处 switch 分叉。
 */
export const CATEGORY_ICON_REGISTRY = [
  { key: 'food', label: '餐饮', icon: Utensils, tone: 'cat-1' },
  { key: 'traffic', label: '交通', icon: TrainFront, tone: 'cat-2' },
  { key: 'home', label: '居住', icon: House, tone: 'cat-3' },
  { key: 'shop', label: '购物', icon: ShoppingBag, tone: 'cat-4' },
  { key: 'fun', label: '娱乐', icon: Clapperboard, tone: 'cat-5' },
  { key: 'health', label: '医疗', icon: HeartPulse, tone: 'cat-6' },
  { key: 'edu', label: '教育', icon: GraduationCap, tone: 'cat-2' },
  { key: 'other', label: '其他', icon: MoreHorizontal, tone: 'cat-6' },
  { key: 'salary', label: '工资', icon: Banknote, tone: 'cat-1' },
  { key: 'inv', label: '理财', icon: TrendingUp, tone: 'cat-1' },
  { key: 'gift', label: '红包', icon: Gift, tone: 'cat-5' },
  { key: 'refund', label: '退款', icon: RotateCcw, tone: 'cat-2' },
  { key: 'move', label: '转账', icon: ArrowLeftRight, tone: 'cat-2' },
] as const satisfies readonly CategoryIconOption[]

const CATEGORY_ICON_BY_KEY = new Map<string, CategoryIconOption>(
  CATEGORY_ICON_REGISTRY.map((option) => [option.key, option]),
)

/** 既有名称映射：分类名 → 注册表 key，旧账本没有 iconKey 时兜底。 */
const ROOT_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_REGISTRY.map((option) => [option.key, option.icon]),
) as Record<string, LucideIcon>

const ROOT_TONES: Record<string, string> = Object.fromEntries(
  CATEGORY_ICON_REGISTRY.map((option) => [option.key, option.tone]),
) as Record<string, string>

export function categoryIconOption(key: string | null | undefined): CategoryIconOption | undefined {
  return key ? CATEGORY_ICON_BY_KEY.get(key) : undefined
}

/** 回退顺序：用户 iconKey → 既有名称映射 → 通用 Tag。 */
export function resolveCategoryIcon(
  iconKey: string | null | undefined,
  rootId: string,
): { icon: LucideIcon; tone: string } {
  const configured = categoryIconOption(iconKey)
  return {
    icon: configured?.icon ?? ROOT_ICONS[rootId] ?? Tag,
    tone: configured?.tone ?? ROOT_TONES[rootId] ?? 'cat-6',
  }
}
