import {
  ArrowDownUp,
  ArrowLeftRight,
  Armchair,
  Banknote,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  BusFront,
  CakeSlice,
  Car,
  ChartLine,
  ChartPie,
  Clapperboard,
  Coffee,
  Coins,
  Cookie,
  CreditCard,
  CupSoda,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Heart,
  HeartPulse,
  House,
  KeyRound,
  Landmark,
  Lightbulb,
  Luggage,
  MoreHorizontal,
  Music,
  NotebookPen,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  ReceiptText,
  RotateCcw,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SquareParking,
  Star,
  Stethoscope,
  Tag,
  Ticket,
  TrainFront,
  TrendingDown,
  TrendingUp,
  Utensils,
  Vault,
  Wallet,
  Wine,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { CategoryIconKey } from '@contracts/constants'

/** 图标选择器的语义分组；账户分组与收支分类共用同一套分组。 */
export type CategoryIconGroupId =
  | 'food'
  | 'traffic'
  | 'shop'
  | 'home'
  | 'fun'
  | 'health'
  | 'edu'
  | 'income'
  | 'finance'
  | 'account'
  | 'other'

export interface CategoryIconOption {
  key: CategoryIconKey
  group: CategoryIconGroupId
  label: string
  /** 搜索关键词：中英文别名，大小写不敏感。 */
  keywords: readonly string[]
  icon: LucideIcon
  tone: string
}

export interface CategoryIconGroup {
  id: CategoryIconGroupId
  label: string
}

/** 分组顺序即选择器的默认展示顺序。 */
export const CATEGORY_ICON_GROUPS = [
  { id: 'food', label: '餐饮' },
  { id: 'traffic', label: '交通' },
  { id: 'shop', label: '购物' },
  { id: 'home', label: '居住' },
  { id: 'fun', label: '娱乐' },
  { id: 'health', label: '医疗' },
  { id: 'edu', label: '教育' },
  { id: 'income', label: '收入' },
  { id: 'finance', label: '转账 / 金融' },
  { id: 'account', label: '账户类' },
  { id: 'other', label: '其他通用' },
] as const satisfies readonly CategoryIconGroup[]

/**
 * 分类图标注册表：键值与契约里的 CATEGORY_ICON_KEYS 一一对应（顺序也一致）。
 *
 * 图标组件、名称回退映射、设置页选择器都从这一份注册表取，避免多处 switch 分叉。
 * tone 只用既有的 cat-1..cat-6，不新增颜色 token；旧 13 个 key 的 tone 保持原值。
 */
export const CATEGORY_ICON_REGISTRY = [
  // 餐饮
  { key: 'food', group: 'food', label: '餐饮', keywords: ['meal', 'dining', 'restaurant', '吃饭', '外卖', '正餐'], icon: Utensils, tone: 'cat-1' },
  { key: 'coffee', group: 'food', label: '咖啡', keywords: ['coffee', 'cafe', 'espresso', 'latte', '咖啡'], icon: Coffee, tone: 'cat-1' },
  { key: 'drink', group: 'food', label: '饮品', keywords: ['drink', 'beverage', 'soda', 'tea', 'milk', '饮品', '饮料', '奶茶'], icon: CupSoda, tone: 'cat-1' },
  { key: 'dessert', group: 'food', label: '甜品', keywords: ['dessert', 'cake', 'sweet', 'ice cream', '甜品', '蛋糕', '冰淇淋'], icon: CakeSlice, tone: 'cat-1' },
  { key: 'grocery', group: 'food', label: '买菜', keywords: ['grocery', 'market', 'vegetable', 'fruit', '买菜', '超市', '生鲜', '菜市场'], icon: ShoppingBasket, tone: 'cat-1' },
  { key: 'snack', group: 'food', label: '零食', keywords: ['snack', 'cookie', 'chips', '零食', '小吃', '饼干'], icon: Cookie, tone: 'cat-1' },
  { key: 'alcohol', group: 'food', label: '酒水', keywords: ['alcohol', 'wine', 'beer', 'bar', '酒水', '喝酒', '酒吧'], icon: Wine, tone: 'cat-1' },
  // 交通
  { key: 'traffic', group: 'traffic', label: '交通', keywords: ['traffic', 'commute', 'transport', '交通', '通勤'], icon: TrainFront, tone: 'cat-2' },
  { key: 'car', group: 'traffic', label: '汽车', keywords: ['car', 'taxi', 'drive', '打车', '汽车', '出租车', '网约车'], icon: Car, tone: 'cat-2' },
  { key: 'bus', group: 'traffic', label: '公交', keywords: ['bus', 'subway', 'metro', '公交', '地铁', '巴士'], icon: BusFront, tone: 'cat-2' },
  { key: 'plane', group: 'traffic', label: '飞机', keywords: ['plane', 'flight', 'air', '飞机', '机票', '航班'], icon: Plane, tone: 'cat-2' },
  { key: 'bike', group: 'traffic', label: '骑行', keywords: ['bike', 'bicycle', 'cycling', '骑行', '单车', '自行车'], icon: Bike, tone: 'cat-2' },
  { key: 'fuel', group: 'traffic', label: '油费', keywords: ['fuel', 'gas', 'petrol', '加油', '油费', '汽油'], icon: Fuel, tone: 'cat-2' },
  { key: 'parking', group: 'traffic', label: '停车', keywords: ['parking', 'car park', '停车', '停车费'], icon: SquareParking, tone: 'cat-2' },
  // 购物
  { key: 'shop', group: 'shop', label: '购物', keywords: ['shop', 'shopping', 'buy', '购物', '买东西'], icon: ShoppingBag, tone: 'cat-4' },
  { key: 'clothes', group: 'shop', label: '服饰', keywords: ['clothes', 'clothing', 'shirt', 'fashion', '服饰', '衣服', '穿搭'], icon: Shirt, tone: 'cat-4' },
  { key: 'beauty', group: 'shop', label: '美容', keywords: ['beauty', 'makeup', 'skincare', '美容', '化妆', '护肤'], icon: Sparkles, tone: 'cat-4' },
  { key: 'digital', group: 'shop', label: '数码', keywords: ['digital', 'electronics', 'phone', 'computer', '数码', '手机', '电脑', '电器'], icon: Smartphone, tone: 'cat-4' },
  { key: 'sports', group: 'shop', label: '运动', keywords: ['sports', 'fitness', 'gym', '运动', '健身', '器材'], icon: Dumbbell, tone: 'cat-4' },
  { key: 'pet', group: 'shop', label: '宠物', keywords: ['pet', 'cat', 'dog', '宠物', '猫', '狗'], icon: PawPrint, tone: 'cat-4' },
  // 居住
  { key: 'home', group: 'home', label: '居住', keywords: ['home', 'housing', '居住', '住房'], icon: House, tone: 'cat-3' },
  { key: 'rent', group: 'home', label: '房租', keywords: ['rent', 'lease', '房租', '租金', '租房'], icon: KeyRound, tone: 'cat-3' },
  { key: 'utilities', group: 'home', label: '水电', keywords: ['utilities', 'electricity', 'water', 'gas', '水电', '电费', '水费', '燃气'], icon: Lightbulb, tone: 'cat-3' },
  { key: 'repair', group: 'home', label: '维修', keywords: ['repair', 'maintenance', 'fix', '维修', '装修', '修理'], icon: Wrench, tone: 'cat-3' },
  { key: 'furniture', group: 'home', label: '家居', keywords: ['furniture', 'chair', '家居', '家具'], icon: Armchair, tone: 'cat-3' },
  // 娱乐
  { key: 'fun', group: 'fun', label: '娱乐', keywords: ['fun', 'movie', 'cinema', 'entertainment', '娱乐', '电影'], icon: Clapperboard, tone: 'cat-5' },
  { key: 'game', group: 'fun', label: '游戏', keywords: ['game', 'gaming', '游戏', '电竞'], icon: Gamepad2, tone: 'cat-5' },
  { key: 'music', group: 'fun', label: '音乐', keywords: ['music', 'concert', '音乐', '演唱会'], icon: Music, tone: 'cat-5' },
  { key: 'ticket', group: 'fun', label: '门票', keywords: ['ticket', '门票', '演出', '展览'], icon: Ticket, tone: 'cat-5' },
  { key: 'travel', group: 'fun', label: '旅行', keywords: ['travel', 'trip', 'vacation', 'hotel', '旅行', '旅游', '酒店', '度假'], icon: Luggage, tone: 'cat-5' },
  // 医疗
  { key: 'health', group: 'health', label: '医疗', keywords: ['health', 'medical', 'doctor', '医疗', '看病', '医院'], icon: HeartPulse, tone: 'cat-6' },
  { key: 'pill', group: 'health', label: '药品', keywords: ['pill', 'medicine', 'drug', '药品', '买药', '药'], icon: Pill, tone: 'cat-6' },
  { key: 'stethoscope', group: 'health', label: '就诊', keywords: ['stethoscope', 'clinic', 'checkup', '就诊', '体检', '门诊'], icon: Stethoscope, tone: 'cat-6' },
  // 教育
  { key: 'edu', group: 'edu', label: '教育', keywords: ['edu', 'education', 'school', 'tuition', '教育', '学费', '学校'], icon: GraduationCap, tone: 'cat-2' },
  { key: 'book', group: 'edu', label: '书籍', keywords: ['book', 'reading', 'books', '书籍', '买书', '读书'], icon: BookOpen, tone: 'cat-2' },
  { key: 'course', group: 'edu', label: '课程', keywords: ['course', 'class', 'training', '课程', '培训', '网课'], icon: NotebookPen, tone: 'cat-2' },
  // 收入
  { key: 'salary', group: 'income', label: '工资', keywords: ['salary', 'payroll', 'wage', 'income', '工资', '薪水', '收入'], icon: Banknote, tone: 'cat-1' },
  { key: 'gift', group: 'income', label: '红包', keywords: ['gift', 'red packet', '红包', '礼金', '礼物'], icon: Gift, tone: 'cat-5' },
  { key: 'bonus', group: 'income', label: '奖金', keywords: ['bonus', 'reward', '奖金', '补贴', '津贴'], icon: HandCoins, tone: 'cat-1' },
  { key: 'coins', group: 'income', label: '零钱', keywords: ['coins', 'cash', '零钱', '零花', '硬币'], icon: Coins, tone: 'cat-1' },
  { key: 'briefcase', group: 'income', label: '兼职', keywords: ['briefcase', 'business', 'freelance', '兼职', '副业', '经营'], icon: Briefcase, tone: 'cat-1' },
  // 转账 / 金融
  { key: 'move', group: 'finance', label: '转账', keywords: ['transfer', 'move', '转账', '互转'], icon: ArrowLeftRight, tone: 'cat-2' },
  { key: 'refund', group: 'finance', label: '退款', keywords: ['refund', 'return', '退款', '退货'], icon: RotateCcw, tone: 'cat-2' },
  { key: 'transfer', group: 'finance', label: '还款', keywords: ['repay', 'repayment', 'transfer', '还款', '还信用卡', '债务'], icon: ArrowDownUp, tone: 'cat-2' },
  { key: 'creditCard', group: 'finance', label: '信用卡', keywords: ['credit card', 'card', '信用卡', '刷卡'], icon: CreditCard, tone: 'cat-2' },
  { key: 'receipt', group: 'finance', label: '账单', keywords: ['receipt', 'bill', 'invoice', '账单', '发票', '手续费'], icon: ReceiptText, tone: 'cat-2' },
  // 账户类
  { key: 'wallet', group: 'account', label: '钱包', keywords: ['wallet', 'purse', '钱包', '零钱包'], icon: Wallet, tone: 'cat-3' },
  { key: 'bank', group: 'account', label: '银行卡', keywords: ['bank', 'card', 'debit', '银行卡', '储蓄卡', '借记卡', '银行'], icon: Landmark, tone: 'cat-2' },
  { key: 'cash', group: 'account', label: '现金', keywords: ['cash', 'cash equivalent', '现金', '现金等价'], icon: PiggyBank, tone: 'cat-3' },
  { key: 'property', group: 'account', label: '房产', keywords: ['property', 'house', 'real estate', '房产', '房子', '不动产', '长期资产'], icon: Building2, tone: 'cat-3' },
  { key: 'stock', group: 'account', label: '股票', keywords: ['stock', 'equity', 'shares', '股票', '证券', '炒股'], icon: ChartLine, tone: 'cat-4' },
  { key: 'fund', group: 'account', label: '基金', keywords: ['fund', 'etf', '基金', '组合'], icon: ChartPie, tone: 'cat-4' },
  { key: 'inv', group: 'account', label: '理财', keywords: ['investment', 'invest', '理财', '投资'], icon: TrendingUp, tone: 'cat-1' },
  { key: 'vault', group: 'account', label: '保险', keywords: ['vault', 'safe', '保险', '保险箱', '存款'], icon: Vault, tone: 'cat-3' },
  { key: 'debt', group: 'account', label: '负债', keywords: ['debt', 'liability', 'loan', '负债', '欠款', '贷款'], icon: TrendingDown, tone: 'cat-2' },
  // 其他通用
  { key: 'other', group: 'other', label: '其他', keywords: ['other', 'misc', '通用', '其他'], icon: MoreHorizontal, tone: 'cat-6' },
  { key: 'tag', group: 'other', label: '标签', keywords: ['tag', 'label', '标签'], icon: Tag, tone: 'cat-6' },
  { key: 'star', group: 'other', label: '收藏', keywords: ['star', 'favorite', '收藏', '星标'], icon: Star, tone: 'cat-5' },
  { key: 'heart', group: 'other', label: '心愿', keywords: ['heart', 'love', '心愿', '喜欢'], icon: Heart, tone: 'cat-5' },
  { key: 'shield', group: 'other', label: '保障', keywords: ['shield', 'insurance', 'protect', '保障', '保险'], icon: ShieldCheck, tone: 'cat-2' },
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

/**
 * 搜索匹配：key、中文标签、中英文关键词都参与，大小写与首尾空格不敏感。
 * 例：`咖啡` 与 `coffee` 都命中 coffee；`COFFEE` 同样命中。
 */
export function matchesCategoryIcon(option: CategoryIconOption, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  if (option.key.toLowerCase().includes(needle)) return true
  if (option.label.toLowerCase().includes(needle)) return true
  return option.keywords.some((keyword) => keyword.toLowerCase().includes(needle))
}

/** 空查询返回全量注册表；否则按上面的规则过滤。 */
export function searchCategoryIcons(query: string): readonly CategoryIconOption[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return CATEGORY_ICON_REGISTRY
  return CATEGORY_ICON_REGISTRY.filter((option) => matchesCategoryIcon(option, needle))
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
