# 图标库集成计划：替换 Emoji 为专业图标

## 一、现状分析

### 当前图标使用方式

* **存储方式**：数据库中 `icon` 字段存储 Emoji 字符串（如 💰、📁）

* **输入方式**：用户通过普通 Input 输入框手动输入 Emoji

* **显示方式**：直接渲染字符串 `{icon} {name}`

### 存在的问题

1. 用户需要手动输入 Emoji，操作不便
2. 不同设备/系统 Emoji 显示不一致
3. 无法保证图标风格统一
4. 缺少专业的记账相关图标

## 二、图标库选择

### 推荐方案：Lucide React

**选择理由**：

| 特性   | 说明                              |
| ---- | ------------------------------- |
| 设计风格 | 简洁现代的线性图标，与 Ant Design 5.x 风格兼容 |
| 图标数量 | 1000+ 图标，包含丰富的金融/记账相关图标         |
| 包大小  | 按需导入，轻量级                        |
| 许可证  | ISC 开源许可证                       |
| 维护状态 | 活跃维护，社区支持良好                     |

**金融相关图标示例**：

```
piggy-bank    - 储蓄罐
wallet        - 钱包
credit-card   - 信用卡
banknote      - 钞票
coins         - 硬币
receipt       - 收据
shopping-cart - 购物车
shopping-bag  - 购物袋
utensils      - 餐饮
car           - 交通
home          - 住房
heart         - 医疗
book          - 教育
plane         - 旅行
gift          - 礼物
briefcase     - 工作
trending-up   - 收入/上涨
trending-down - 支出/下跌
arrow-left-right - 转账
```

### 备选方案：React Icons

如果需要更多图标选择，可使用 React Icons，它集成了 30+ 图标库：

* Lucide

* Material Design

* Font Awesome

* Ionicons

* Feather

## 三、技术方案

### 数据库字段变更

**保持兼容性**：`icon` 字段继续使用 `String?` 类型，但存储图标名称而非 Emoji

```
旧值: "💰"
新值: "wallet"
```

### 前端组件变更

#### 1. 创建图标选择器组件

```tsx
// frontend/src/components/IconPicker.tsx
import * as LucideIcons from 'lucide-react'
import { Popover, Input } from 'antd'

// 预定义的记账相关图标列表
const FINANCE_ICONS = [
  // 账户类型
  'wallet', 'credit-card', 'piggy-bank', 'banknote', 'coins',
  'building-2', 'landmark', 'safe',
  
  // 收入分类
  'briefcase', 'trending-up', 'gift', 'award', 'trophy',
  
  // 支出分类
  'shopping-cart', 'shopping-bag', 'utensils', 'car', 'home',
  'heart', 'book', 'plane', 'gamepad-2', 'film', 'music',
  'coffee', 'smartphone', 'shirt', 'scissors', 'dumbbell',
  
  // 转账分类
  'arrow-left-right', 'send', 'receive', 'repeat',
]
```

#### 2. 创建图标渲染组件

```tsx
// frontend/src/components/DynamicIcon.tsx
import * as LucideIcons from 'lucide-react'

interface DynamicIconProps {
  name: string | null | undefined
  size?: number
  className?: string
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ name, size = 16, className }) => {
  if (!name) return null
  
  // 兼容旧数据：如果是 Emoji，直接显示
  if (isEmoji(name)) {
    return <span className={className}>{name}</span>
  }
  
  // 动态获取图标组件
  const IconComponent = (LucideIcons as any)[toPascalCase(name)]
  
  if (!IconComponent) {
    return <span className={className}>{name}</span>
  }
  
  return <IconComponent size={size} className={className} />
}
```

#### 3. 兼容性处理

* 取消旧数据的兼容性，移除无用代码

### Step 1: 安装依赖

```bash
cd frontend
npm install lucide-react
```

### Step 2: 创建公共组件

1. 创建 `IconPicker.tsx` - 图标选择器
2. 创建 `DynamicIcon.tsx` - 动态图标渲染

### Step 3: 更新表单组件

1. 更新 `AccountCategoryModal.tsx` - 账户分类和账户表单
2. 更新 `TransactionCategoryModal.tsx` - 收支分类表单

### Step 4: 更新显示组件

1. 更新表格列中的图标显示
2. 更新下拉选择器中的图标显示
3. 更新交易记录列表中的图标显示

### Step 5: 预设默认图标

为常用分类提供默认图标映射：

```typescript
const DEFAULT_ICONS = {
  // 账户分类
  '现金及现金等价物': 'wallet',
  '投资': 'trending-up',
  '固定资产': 'home',
  '负债': 'credit-card',
  
  // 收入分类
  '工资': 'briefcase',
  '奖金': 'gift',
  '投资收益': 'trending-up',
  
  // 支出分类
  '餐饮': 'utensils',
  '交通': 'car',
  '购物': 'shopping-cart',
  '娱乐': 'gamepad-2',
  '医疗': 'heart',
  '教育': 'book',
  '旅行': 'plane',
}
```

## 五、文件变更清单

| 文件                                                     | 操作 | 说明                 |
| ------------------------------------------------------ | -- | ------------------ |
| `frontend/package.json`                                | 修改 | 添加 lucide-react 依赖 |
| `frontend/src/components/IconPicker.tsx`               | 新建 | 图标选择器组件            |
| `frontend/src/components/DynamicIcon.tsx`              | 新建 | 动态图标渲染组件           |
| `frontend/src/components/AccountCategoryModal.tsx`     | 修改 | 使用图标选择器            |
| `frontend/src/components/TransactionCategoryModal.tsx` | 修改 | 使用图标选择器            |
| `frontend/src/pages/Transactions.tsx`                  | 修改 | 使用 DynamicIcon     |
| `frontend/src/pages/Dashboard.tsx`                     | 修改 | 使用 DynamicIcon     |
| `frontend/src/pages/Budgets.tsx`                       | 修改 | 使用 DynamicIcon     |
| `frontend/src/pages/Reports.tsx`                       | 修改 | 使用 DynamicIcon     |
| `frontend/src/components/CashFlowConfigModal.tsx`      | 修改 | 使用 DynamicIcon     |

## 六、向后兼容性

### 数据兼容

* 取消旧数据的兼容性，移除无用代码

### 用户体验

* 图标选择器提供可视化选择

* 支持搜索功能

* 分类展示（账户、收入、支出、转账）

* 预览效果

## 七、预期效果

### 视觉效果
- 统一的图标风格
- 更专业的视觉呈现
- 更好的跨平台一致性

### 用户体验
- 点击选择图标，无需手动输入
- 图标预览
- 快速搜索定位

### 开发维护
- 类型安全的图标引用
- 按需加载，性能优化
- 易于扩展新图标

## 八、实施状态

✅ 已完成所有步骤：
1. ✅ 安装 lucide-react 依赖
2. ✅ 创建 DynamicIcon 组件（动态图标渲染，支持 Emoji 兼容）
3. ✅ 创建 IconPicker 组件（可视化图标选择器）
4. ✅ 更新 AccountCategoryModal 使用图标选择器
5. ✅ 更新 TransactionCategoryModal 使用图标选择器
6. ✅ 更新 Transactions、Dashboard、Budgets、Reports、CashFlowConfigModal 等组件使用 DynamicIcon
7. ✅ 类型检查通过（预存问题与本次修改无关）

