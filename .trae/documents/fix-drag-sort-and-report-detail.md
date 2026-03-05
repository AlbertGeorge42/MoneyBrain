# 修复拖拽排序与报表明细展示

## 问题分析

### 问题1：拖拽排序无法生效
**原因分析**：
1. `SortableRow` 组件实现方式不正确
2. `DndContext` 和 `SortableContext` 的 items 属性需要与数据源的 key 匹配
3. Table 的 `components.body.row` 配置需要正确设置

**当前代码问题**：
- `SortableRow` 组件接收 `id` 属性，但 Table 的 rowKey 是 `key` 字段
- `SortableContext` 的 items 使用的是 `buildTreeData.assetNodes.map(n => n.id)`，但表格数据源是树形结构

### 问题2：报表页面不展示子账户明细
**原因分析**：
1. 资产负债表只显示 `assetsByCategory` 汇总数据
2. 收入支出表只显示 `incomeByCategory` 和 `expenseByCategory` 汇总数据
3. 后端返回的 `accounts` 数组包含具体账户信息，但前端没有展示

## 实施步骤

### Step 1: 修复拖拽排序功能
1. 修改 `SortableRow` 组件，正确处理 Table 行
2. 确保 `SortableContext` 的 items 与数据源匹配
3. 修复 `handleDragEnd` 函数

### Step 2: 修改资产负债表展示
1. 后端：确保返回完整的账户列表（包含分类信息）
2. 前端：将分类汇总改为树形表格展示，显示每个账户的余额

### Step 3: 修改收入支出表展示
1. 后端：添加按账户分组的收入支出明细
2. 前端：展示每个账户的收入支出明细

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/AccountCategoryModal.tsx` | 修复 | 修复拖拽排序 |
| `frontend/src/pages/Reports.tsx` | 修改 | 展示账户明细 |
| `backend/src/routes/report.ts` | 修改 | 返回账户明细数据 |

## 详细设计

### 1. 拖拽排序修复方案

```tsx
// 使用 Ant Design Table 的拖拽排序实现
// 参考：https://ant.design/components/table-cn#components-table-demo-drag-sorting

import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// 可排序行组件
const SortableRow = (props: any) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props['data-row-key'],
  })

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, background: '#fafafa' } : {}),
  }

  return <tr {...props} ref={setNodeRef} style={style} {...attributes} {...listeners} />
}

// 在 Table 中使用
<Table
  components={{
    body: {
      row: SortableRow,
    },
  }}
  rowKey="id"
/>
```

### 2. 资产负债表展示方案

将分类汇总改为树形表格：
```
资产明细
├── 现金及现金等价物
│   ├── 银行卡        ¥10,000.00
│   └── 支付宝        ¥5,000.00
├── 投资
│   ├── 股票账户      ¥20,000.00
│   └── 基金账户      ¥15,000.00
└── 合计              ¥50,000.00
```

### 3. 收入支出表展示方案

添加账户明细表格：
```
收入明细
├── 银行卡
│   ├── 工资          ¥10,000.00
│   └── 理财收益      ¥500.00
├── 支付宝
│   └── 兼职收入      ¥2,000.00
└── 合计              ¥12,500.00
```

## 验证清单
- [ ] 拖拽排序功能正常工作
- [ ] 资产负债表展示账户明细
- [ ] 收入支出表展示账户明细
- [ ] 树形表格正确展开/收起
