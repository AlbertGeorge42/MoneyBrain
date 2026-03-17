# 设置页面表格优化与拖拽排序功能规格说明（修订版）

## 一、三种设置页面的职责划分

### 1.1 账户分类管理 (AccountCategoryModal)
**核心职责**: 管理账户分类和账户

**管理内容**:
- 资产分类的增删改查
- 负债分类的增删改查
- 账户的增删改查
- 账户分类的拖拽排序
- 账户分类的层级管理（父子分类）

**不涉及**:
- 现金等价物配置（移至 CashFlowConfigModal）
- 现金流活动类型配置

### 1.2 收支分类管理 (TransactionCategoryModal)
**核心职责**: 管理收支和转账分类

**管理内容**:
- 收入分类的增删改查
- 支出分类的增删改查
- 转账分类的增删改查
- 收支分类的拖拽排序
- 收支分类的层级管理（父子分类）

**不涉及**:
- 现金流活动类型配置（移至 CashFlowConfigModal）

### 1.3 现金流量表设置 (CashFlowConfigModal)
**核心职责**: 配置现金流量表相关设置

**管理内容**:
- 现金等价物配置（标记哪些账户分类属于现金等价物）
- 现金流活动类型配置（为收支分类配置经营/投资/筹资类型）

**特点**:
- 这是配置页面，不是管理页面
- 只修改现有分类的属性，不创建新分类
- 配置结果影响现金流量表的计算

---

## 二、职责边界对比

| 功能 | AccountCategoryModal | TransactionCategoryModal | CashFlowConfigModal |
|------|:--------------------:|:-----------------------:|:-------------------:|
| 资产分类管理 | ✅ | ❌ | ❌ |
| 负债分类管理 | ✅ | ❌ | ❌ |
| 账户管理 | ✅ | ❌ | ❌ |
| 收入分类管理 | ❌ | ✅ | ❌ |
| 支出分类管理 | ❌ | ✅ | ❌ |
| 转账分类管理 | ❌ | ✅ | ❌ |
| 现金等价物配置 | ❌ | ❌ | ✅ |
| 现金流活动类型配置 | ❌ | ❌ | ✅ |
| 分类拖拽排序 | ✅ | ✅ | ❌ |

---

## 三、优化方案

### 3.1 AccountCategoryModal 优化

#### 布局调整
- 使用 Tabs 切换资产/负债分类
- 精简表格列：
  - 移除"类型"列（通过Tab已区分）
  - 移除"现金等价物"列（移至 CashFlowConfigModal）
- 操作列优化：
  - 使用下拉菜单收纳不常用操作

#### 拖拽排序
- 保持现有的一级分类拖拽排序功能

### 3.2 TransactionCategoryModal 优化

#### 布局调整
- 精简表格列：
  - 移除"层级"列（通过缩进已区分）
  - 移除"现金流类型"列（移至 CashFlowConfigModal）

#### 新增拖拽排序
- 添加 dnd-kit 拖拽功能
- 支持一级分类拖拽排序
- 调用后端 `/categories/sort/batch` API

### 3.3 CashFlowConfigModal 优化

#### 布局调整
- 保持现有结构
- 优化表格显示
- 添加必要的说明文字

#### 功能确认
- 现金等价物配置：配置资产分类是否为现金等价物
- 活动类型配置：配置收支分类的现金流活动类型

---

## 四、详细实现方案

### 4.1 AccountCategoryModal 修改

#### 移除的内容
- 移除"现金等价物"列
- 移除 `handleCashEquivalentChange` 函数
- 移除 `updateAccountCategoryCashEquivalent` 调用

#### 保留的内容
- 分类和账户的增删改查
- 拖拽排序功能
- Tabs 布局优化

### 4.2 TransactionCategoryModal 修改

#### 移除的内容
- 移除"层级"列
- 移除"现金流类型"列
- 移除表单中的 `cashFlowType` 字段

#### 新增的内容
- 拖拽排序功能（SortableRow, DragHandle, handleDragEnd）
- categoryApi.updateSort 调用

### 4.3 CashFlowConfigModal 修改

#### 保持不变
- 现金等价物配置功能
- 现金流活动类型配置功能
- Tab 切换布局

#### 优化
- 精简表格列
- 优化显示样式

### 4.4 api.ts 修改

```typescript
// 添加 categoryApi.updateSort 方法
export const categoryApi = {
  // ... 现有方法
  updateSort: (items: Array<{ id: string; sort: number; parentId: string | null }>) => 
    api.put<ApiResponse<{ message: string }>>('/categories/sort/batch', { items }),
}
```

---

## 五、任务分解

### 阶段一：TransactionCategoryModal 拖拽排序
1. 添加 dnd-kit 相关导入
2. 创建 SortableRow 和 DragHandle 组件
3. 实现拖拽排序逻辑
4. 添加 categoryApi.updateSort 方法
5. 测试验证

### 阶段二：布局优化
1. TransactionCategoryModal 精简表格列
2. AccountCategoryModal 精简表格列
3. AccountCategoryModal 使用 Tabs 布局
4. 测试验证

### 阶段三：功能迁移
1. 从 AccountCategoryModal 移除现金等价物配置
2. 从 TransactionCategoryModal 移除现金流类型配置
3. 确认 CashFlowConfigModal 功能完整
4. 全面测试验证

---

## 六、验证清单

### 功能验证
- [ ] 收支分类拖拽排序正常
- [ ] 账户分类拖拽排序正常
- [ ] 分类增删改查正常
- [ ] 账户增删改查正常
- [ ] 现金等价物配置正常（在 CashFlowConfigModal）
- [ ] 现金流活动类型配置正常（在 CashFlowConfigModal）

### 职责边界验证
- [ ] AccountCategoryModal 不涉及现金流量表配置
- [ ] TransactionCategoryModal 不涉及现金流量表配置
- [ ] CashFlowConfigModal 专注于现金流量表配置
- [ ] 三个页面无功能交叉

### 界面验证
- [ ] 表格布局简洁美观
- [ ] 操作按钮布局合理
- [ ] 拖拽交互流畅

### 代码验证
- [ ] TypeScript 类型检查通过
- [ ] 无未使用的导入
- [ ] 无 console.log 等调试代码
