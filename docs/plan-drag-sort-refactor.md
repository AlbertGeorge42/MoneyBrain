# 拖拽排序重构计划

## 问题分析

### 现象描述
1. **没有子类别的项拖动自然** - 正常工作
2. **有子类别的项拖动后出现重复移动** - 拖动释放后，被插入位置附近的其他项出现重复移动

### 根本原因分析

经过代码审查，发现以下问题：

#### 问题1：`verticalListSortingStrategy` 与树形数据不兼容

当前代码使用 `verticalListSortingStrategy`，这个策略假设所有可排序项都在同一个扁平列表中。但实际数据是树形结构：

```tsx
// 当前代码问题
<SortableContext items={sortableKeys} strategy={verticalListSortingStrategy}>
```

`sortableKeys` 包含所有一级和二级分类的 key，但二级分类在视觉上是有缩进的（通过 `indentSize={20}`）。当使用 `verticalListSortingStrategy` 时：
- dnd-kit 计算位置时把所有项当作同一层级
- 但视觉上二级分类有缩进，导致位置计算偏差
- 拖动一级分类时，可能与二级分类发生碰撞检测

#### 问题2：展开状态下的排序逻辑缺陷

当一级分类展开时，其子分类会显示在表格中。此时：

1. `getSortableKeys` 返回所有可见的 key（包含一级和二级）
2. 但 `handleDragEnd` 只处理两种情况：
   - 一级分类之间排序（`isTopLevel`）
   - 二级分类之间排序（`isSecondLevel`）
3. **缺失场景**：当拖动一级分类到另一个一级分类位置，但中间有展开的二级分类时，碰撞检测可能匹配到二级分类

#### 问题3：本地状态更新与 API 调用顺序问题

```tsx
// 当前代码流程
setLocalCategories(updatedLocalCategories)  // 立即更新本地状态
await categoryApi.updateSort(items)         // 调用 API
fetchCategories()                           // 重新获取数据
```

问题：
- `fetchCategories()` 会触发 `useEffect` 重新设置 `localCategories`
- 如果 API 返回的数据与本地状态不同步，会导致视觉跳动
- 多次快速拖动可能导致状态混乱

#### 问题4：`closestCenter` 碰撞检测不适合树形结构

```tsx
<DndContext collisionDetection={closestCenter} ...>
```

`closestCenter` 检测最近的可拖动元素中心点，但在树形结构中：
- 一级分类和二级分类的视觉位置不同（缩进）
- 可能误判拖动目标

## 重构方案

### 方案概述
将拖拽排序拆分为两个独立的上下文：
1. **一级分类排序**：只处理顶级分类之间的拖拽
2. **二级分类排序**：在展开状态下，只处理同一父分类下的子分类拖拽

### 详细设计

#### 1. 分离 SortableContext

**修改前**：
```tsx
<SortableContext items={sortableKeys} strategy={verticalListSortingStrategy}>
  <Table ... />
</SortableContext>
```

**修改后**：
```tsx
// 一级分类使用独立的 DndContext
<DndContext onDragEnd={handleTopLevelDragEnd}>
  <SortableContext items={topLevelKeys} strategy={verticalListSortingStrategy}>
    <Table 
      components={{
        body: {
          row: (props) => <SortableRow {...props} isTopLevel />,
        },
      }}
    />
  </SortableContext>
</DndContext>

// 二级分类在行内使用独立的 SortableContext
// 通过自定义行组件实现
```

#### 2. 改进碰撞检测策略

使用 `pointerWithin` 替代 `closestCenter`，更精确地检测鼠标位置：

```tsx
import { pointerWithin } from '@dnd-kit/core'

<DndContext collisionDetection={pointerWithin} ...>
```

#### 3. 优化状态管理

**修改前**：
```tsx
setLocalCategories(updatedLocalCategories)
await categoryApi.updateSort(items)
fetchCategories()  // 可能导致状态冲突
```

**修改后**：
```tsx
// 方案A：乐观更新 + 防抖
// 1. 立即更新本地状态
// 2. 防抖调用 API
// 3. API 成功后不重新获取，失败时回滚

// 方案B：等待 API 响应
// 1. 先调用 API
// 2. 成功后更新本地状态
// 3. 失败时显示错误，不更新状态
```

推荐使用方案A，用户体验更好。

#### 4. 重构 SortableRow 组件

```tsx
interface SortableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-row-key': string
  isTopLevel: boolean
  parentId?: string
}

const SortableRow = ({ isTopLevel, parentId, ...props }: SortableRowProps) => {
  const id = props['data-row-key']
  
  // 只有匹配当前上下文的行才可排序
  const { attributes, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id,
    disabled: !shouldEnableSort(id, isTopLevel, parentId),
  })
  
  // ... 渲染逻辑
}
```

#### 5. 拆分 handleDragEnd 函数

```tsx
// 一级分类拖拽处理
const handleTopLevelDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return
  
  // 只处理一级分类
  const activeId = extractId(active.id)
  const overId = extractId(over.id)
  
  if (!isTopLevelCategory(activeId) || !isTopLevelCategory(overId)) return
  
  // 执行排序逻辑
  await reorderTopLevelCategories(activeId, overId)
}

// 二级分类拖拽处理（在展开的行内）
const handleSecondLevelDragEnd = async (event: DragEndEvent, parentId: string) => {
  // 类似逻辑，但限制在同一父分类下
}
```

### 实现步骤

#### 第一阶段：修复核心问题（优先级高）

1. **修改碰撞检测策略**
   - 将 `closestCenter` 改为 `pointerWithin`
   - 添加 `restrictToParentElement` 修饰符

2. **修复展开状态下的排序问题**
   - 在 `handleDragEnd` 开头添加类型检查
   - 如果拖动目标和放置目标不是同一层级，直接返回

3. **优化状态更新流程**
   - 使用乐观更新
   - API 失败时回滚本地状态

#### 第二阶段：重构架构（优先级中）

4. **拆分 SortableContext**
   - 为每个层级创建独立的排序上下文
   - 修改 `SortableRow` 组件支持层级判断

5. **提取公共逻辑**
   - 创建 `useDragSort` 自定义 Hook
   - 统一 `TransactionCategoryModal` 和 `AccountCategoryModal` 的拖拽逻辑

#### 第三阶段：优化体验（优先级低）

6. **添加拖拽动画优化**
   - 使用 `AnimateLayoutChanges` 自定义动画
   - 添加拖拽占位符

7. **添加拖拽预览**
   - 拖动时显示被拖动项的预览
   - 放置位置指示器

## 修改文件清单

1. `frontend/src/components/TransactionCategoryModal.tsx`
   - 修改碰撞检测策略
   - 修复 handleDragEnd 逻辑
   - 优化状态更新流程

2. `frontend/src/components/AccountCategoryModal.tsx`
   - 同步应用相同的修复

3. `frontend/src/hooks/useDragSort.ts`（新建，可选）
   - 提取公共拖拽排序逻辑

## 风险评估

1. **低风险**：修改碰撞检测策略
   - 只影响检测方式，不影响业务逻辑

2. **中风险**：修改状态更新流程
   - 需要仔细测试边界情况
   - 确保失败时正确回滚

3. **高风险**：拆分 SortableContext
   - 需要较大改动
   - 建议分阶段实施

## 测试要点

1. **基本排序测试**
   - 拖动一级分类到另一个一级分类位置
   - 拖动二级分类到另一个二级分类位置

2. **展开状态测试**
   - 展开一级分类后拖动其他一级分类
   - 展开状态下拖动二级分类

3. **边界情况测试**
   - 拖动到列表首尾
   - 快速连续拖动
   - API 失败时的回滚

4. **跨组件测试**
   - 验证 `AccountCategoryModal` 同样修复
