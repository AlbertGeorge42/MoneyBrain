# 筛选功能优化计划

## 目标
重新设计交易记录页面的筛选UI，减少输入框占用空间，提供更清晰的账户与分类选择，支持多选操作。

## 当前问题分析

1. **UI占用空间大**：5个筛选控件排成一行，每个控件较窄，不够美观
2. **分类选择混乱**：收入和支出分类混在一起，虽然有分隔线但仍不够清晰
3. **不支持多选**：账户、分类、类型都只能单选，筛选能力有限

## 优化方案

### 1. UI重新设计

**采用折叠式筛选面板**：
- 默认收起状态，只显示"筛选"按钮和已选筛选条件的标签
- 点击展开后显示完整筛选选项
- 减少对页面空间的占用

**筛选条件标签化**：
- 已选的筛选条件以标签形式显示在筛选按钮旁边
- 点击标签可快速清除对应筛选条件

### 2. 分类选择优化

**按类型分组显示**：
- 使用 Select 的 `mode="multiple"` 支持多选
- 支出分类和收入分类使用 OptGroup 分组
- 显示分类图标，便于识别

### 3. 多选支持

**支持多选的字段**：
- 类型：支持选择多种交易类型
- 账户：支持选择多个账户
- 分类：支持选择多个分类

**日期范围保持单选**：日期范围选择器保持现有功能

## 实现步骤

### 步骤1：后端API支持多选参数

修改 `backend/src/services/transaction.service.ts`：
- `type` 参数支持数组：`type: string | string[]`
- `accountId` 参数支持数组：`accountId: string | string[]`
- `categoryId` 参数支持数组：`categoryId: string | string[]`
- 修改 where 条件构建逻辑，使用 `in` 操作符

修改 `backend/src/routes/transaction.ts`：
- 解析数组类型的查询参数

### 步骤2：前端状态管理优化

修改 `frontend/src/pages/Transactions.tsx`：
- `filters` 状态改为数组类型：
  ```typescript
  type: string[]
  accountId: string[]
  categoryId: string[]
  ```
- 添加 `filterExpanded` 状态控制面板展开/收起

### 步骤3：UI组件实现

**筛选按钮区域**：
- 添加"筛选"按钮，点击展开/收起面板
- 已选条件以 Tag 形式显示，可点击删除

**筛选面板**：
- 使用 Collapse 组件实现折叠效果
- 类型选择：多选 Select，选项带颜色标识
- 账户选择：多选 Select，按账户分类分组
- 分类选择：多选 Select，按收入/支出分组
- 日期范围：保持 RangePicker
- 操作按钮：查询、重置

### 步骤4：查询逻辑调整

- 多选参数传递给后端时，使用逗号分隔或数组形式
- 分页时保持筛选条件

## 技术细节

### 后端参数处理

```typescript
// transaction.service.ts
if (accountId && Array.isArray(accountId)) {
  where.OR = accountId.map(id => [
    { accountId: id },
    { toAccountId: id },
  ]).flat()
}
if (categoryId && Array.isArray(categoryId)) {
  where.categoryId = { in: categoryId }
}
if (type && Array.isArray(type)) {
  where.type = { in: type }
}
```

### 前端筛选标签显示

```tsx
// 已选筛选条件标签
{filters.type.map(t => (
  <Tag closable onClose={() => removeFilter('type', t)}>
    {typeLabels[t]}
  </Tag>
))}
{filters.accountId.map(id => (
  <Tag closable onClose={() => removeFilter('accountId', id)}>
    {getAccountName(id)}
  </Tag>
))}
// ...
```

## 文件修改清单

1. `backend/src/services/transaction.service.ts` - 支持多选参数查询
2. `backend/src/routes/transaction.ts` - 解析数组参数
3. `frontend/src/pages/Transactions.tsx` - UI重构和多选支持

## 预期效果

1. 筛选面板默认收起，页面更简洁
2. 筛选条件一目了然，可快速清除
3. 支持多选筛选，查询更灵活
4. 分类按类型分组，选择更清晰
