# 分类表格展示优化与拖拽排序功能

## 目标
1. 修改表格展示方式，支持展示子类别（树形结构）
2. 支持类别展示的顺序拖拽排序功能

## 需求分析

### 当前问题
- 分类表格是扁平展示，不支持树形展开
- 分类没有排序字段，无法自定义顺序
- 用户无法调整分类的显示顺序

### 改进方案
1. **树形表格展示**：使用 Ant Design 的可展开表格展示子分类
2. **拖拽排序**：添加 sort 字段，支持拖拽调整顺序
3. **后端接口**：添加批量更新排序接口

## 实施步骤

### Step 1: 数据库模型修改
- Category 模型添加 `sort` 字段（排序序号）
- AccountCategory 模型添加 `sort` 字段

### Step 2: 后端 API 修改
- 添加批量更新排序接口
- 查询时按 sort 字段排序

### Step 3: 前端表格重构
- 使用可展开表格展示子分类
- 集成拖拽排序功能
- 实现排序保存

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/prisma/schema.prisma` | 修改 | 添加 sort 字段 |
| `backend/src/routes/category.ts` | 修改 | 添加排序接口 |
| `backend/src/routes/account-category.ts` | 修改 | 添加排序接口 |
| `frontend/src/components/AccountCategoryModal.tsx` | 重构 | 树形表格+拖拽排序 |
| `frontend/src/components/TransactionCategoryModal.tsx` | 重构 | 树形表格+拖拽排序 |
| `frontend/src/services/api.ts` | 修改 | 添加排序接口 |

## 详细设计

### 1. 数据库模型修改

```prisma
model Category {
  id           String        @id @default(uuid())
  name         String
  type         String
  icon         String?
  cashFlowType String?
  parentId     String?
  sort         Int           @default(0)  // 排序序号
  parent       Category?     @relation("CategoryTree", fields: [parentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  children     Category[]    @relation("CategoryTree")
  transactions Transaction[]
  budgets      Budget[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@map("categories")
}

model AccountCategory {
  id               String             @id @default(uuid())
  name             String
  type             String
  icon             String?
  parentId         String?
  sort             Int                @default(0)  // 排序序号
  parent           AccountCategory?   @relation("AccountCategoryTree", fields: [parentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  children         AccountCategory[]  @relation("AccountCategoryTree")
  isCashEquivalent Boolean            @default(false)
  accounts         Account[]
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  @@map("account_categories")
}
```

### 2. 后端排序接口

```
PUT /api/categories/sort
Body: {
  items: Array<{ id: string, sort: number, parentId: string | null }>
}

PUT /api/account-categories/sort
Body: {
  items: Array<{ id: string, sort: number, parentId: string | null }>
}
```

### 3. 前端拖拽实现

使用 `@dnd-kit/core` 和 `@dnd-kit/sortable` 实现拖拽排序：
- 支持同级拖拽排序
- 支持跨级拖拽（改变父级）
- 实时保存排序结果

### 4. 树形表格展示

使用 Ant Design Table 的 `expandable` 配置：
- 默认展开所有节点
- 显示层级缩进
- 支持展开/收起

## 验证清单
- [ ] 数据库添加 sort 字段成功
- [ ] 后端排序接口正常工作
- [ ] 前端表格正确展示树形结构
- [ ] 拖拽排序功能正常
- [ ] 排序保存正确
- [ ] 子分类正确显示在父分类下
