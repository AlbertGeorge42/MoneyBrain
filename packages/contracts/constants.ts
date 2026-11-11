// ===== 破坏性操作的确认值 =====
//
// 清空数据这类不可逆操作必须由调用方显式带上确认值。
// 前后端共用同一份常量，避免两边各写一个字面量而悄悄漂移。

export const CLEAR_CONFIRM = {
  /** 清空全部数据 */
  all: 'clear-all',
  /** 仅清空交易数据 */
  transactions: 'clear-transactions',
} as const

// ===== 备份数据类型 =====
//
// 备份包含哪几类数据由后端决定，前后端共用同一份常量，避免两边各写一份而悄悄漂移。

export const BACKUP_DATA_TYPES = ['transactions', 'config', 'budgets', 'snapshots'] as const

export type BackupDataType = (typeof BACKUP_DATA_TYPES)[number]

// ===== 回滚确认值 =====
//
// 回滚会用快照覆盖当前数据，同样不可逆——按破坏性接口的规矩，
// 请求必须带确认值，取值来自这里，避免前后端各写一份。

export const ROLLBACK_CONFIRM = {
  /** 回滚到指定回滚点 */
  restore: 'restore-snapshot',
  /** 撤销指定导入批次（只删该批新建的行） */
  import: 'rollback-import',
} as const

// ===== 分类图标（受控枚举） =====
//
// 只有注册表内的 key 才能落库；空 / null 表示回退到按分类名映射的既有图标。
// 图标组件与名称映射都在前端注册表里维护，这里只收口「允许写哪些值」。
//
// 顺序与前端注册表一致，按语义分组排列：餐饮 → 交通 → 购物 → 居住 → 娱乐 →
// 医疗 → 教育 → 收入 → 转账/金融 → 账户类 → 其他。
// 前 13 个旧 key（food…move）是历史数据，只增不改：已落库的 iconKey 必须继续有效。

export const CATEGORY_ICON_KEYS = [
  // 餐饮
  'food',
  'coffee',
  'drink',
  'dessert',
  'grocery',
  'snack',
  'alcohol',
  // 交通
  'traffic',
  'car',
  'bus',
  'plane',
  'bike',
  'fuel',
  'parking',
  // 购物
  'shop',
  'clothes',
  'beauty',
  'digital',
  'sports',
  'pet',
  // 居住
  'home',
  'rent',
  'utilities',
  'repair',
  'furniture',
  // 娱乐
  'fun',
  'game',
  'music',
  'ticket',
  'travel',
  // 医疗
  'health',
  'pill',
  'stethoscope',
  // 教育
  'edu',
  'book',
  'course',
  // 收入
  'salary',
  'gift',
  'bonus',
  'coins',
  'briefcase',
  // 转账/金融
  'move',
  'refund',
  'transfer',
  'creditCard',
  'receipt',
  // 账户类
  'wallet',
  'bank',
  'cash',
  'property',
  'stock',
  'fund',
  'inv',
  'vault',
  'debt',
  // 其他通用
  'other',
  'tag',
  'star',
  'heart',
  'shield',
] as const

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number]

export function isCategoryIconKey(value: unknown): value is CategoryIconKey {
  return typeof value === 'string' && (CATEGORY_ICON_KEYS as readonly string[]).includes(value)
}
