# 设置页面表格优化检查清单（修订版）

## 开发前检查

### 环境准备
- [x] 确认前端开发服务器运行正常
- [x] 确认后端开发服务器运行正常
- [x] 确认 dnd-kit 已安装

### 代码备份
- [x] 确认当前代码已提交

---

## 阶段一：TransactionCategoryModal 拖拽排序

### API 修改
- [x] api.ts 添加 categoryApi.updateSort 方法

### 添加拖拽功能
- [x] 添加 dnd-kit 导入
- [x] 创建 SortableRow 组件
- [x] 创建 DragHandle 组件
- [x] 配置 sensors
- [x] 实现 handleDragEnd 函数
- [x] 集成 DndContext 到表格
- [x] 添加拖拽手柄列

### 阶段一验证
- [x] 收入分类拖拽排序正常
- [x] 支出分类拖拽排序正常
- [x] 转账分类拖拽排序正常
- [x] 排序结果保存正常

---

## 阶段二：布局优化

### TransactionCategoryModal 优化
- [x] 移除"层级"列
- [x] 移除"现金流类型"列
- [x] 移除表单中的 cashFlowType 字段
- [x] 优化操作按钮布局（使用 Dropdown）

### AccountCategoryModal 优化
- [x] 移除"类型"列
- [x] 移除"现金等价物"列
- [x] 移除 handleCashEquivalentChange 函数
- [x] 移除 updateAccountCategoryCashEquivalent 调用
- [x] 使用 Tabs 替代两个独立表格
- [x] 优化操作按钮布局

### CashFlowConfigModal 优化
- [x] 保持现有功能不变
- [x] 专注于现金流量表配置

### 阶段二验证
- [x] 表格布局简洁美观
- [x] 操作按钮布局合理
- [x] 无冗余信息显示

---

## 阶段三：功能迁移与验证

### 职责边界确认
- [x] AccountCategoryModal 不涉及现金流量表配置
- [x] TransactionCategoryModal 不涉及现金流量表配置
- [x] CashFlowConfigModal 专注于现金流量表配置
- [x] 三个页面无功能交叉

### 功能测试
- [ ] 收支分类拖拽排序正常（需用户手动验证）
- [ ] 账户分类拖拽排序正常（需用户手动验证）
- [ ] 分类增删改查正常（需用户手动验证）
- [ ] 账户增删改查正常（需用户手动验证）
- [ ] 现金等价物配置正常（CashFlowConfigModal）（需用户手动验证）
- [ ] 现金流活动类型配置正常（CashFlowConfigModal）（需用户手动验证）

### 界面测试
- [ ] 表格布局简洁美观（需用户手动验证）
- [ ] 操作按钮布局合理（需用户手动验证）
- [ ] 拖拽交互流畅（需用户手动验证）
- [ ] 响应式布局正常（需用户手动验证）
- [ ] 无视觉错位问题（需用户手动验证）

### 代码质量
- [x] 前端 typecheck 通过
- [x] 无未使用的导入
- [x] 无 console.log 等调试代码

---

## 三种设置页面职责划分

| 页面 | 核心职责 | 管理内容 |
|------|----------|----------|
| AccountCategoryModal | 账户分类和账户管理 | 资产/负债分类、账户的增删改查、拖拽排序 |
| TransactionCategoryModal | 收支分类管理 | 收入/支出/转账分类的增删改查、拖拽排序 |
| CashFlowConfigModal | 现金流量表配置 | 现金等价物配置、现金流活动类型配置 |

---

## 问题记录

| 问题 | 发现时间 | 解决方案 | 状态 |
|------|----------|----------|------|
| 未使用的导入 | 类型检查时 | 移除 Divider 和 Popconfirm 导入 | 已解决 |

---

## 完成总结

### 已完成的优化

1. **TransactionCategoryModal**
   - 添加了拖拽排序功能（一级分类）
   - 移除了"层级"列和"现金流类型"列
   - 移除了表单中的 cashFlowType 字段
   - 优化了操作按钮布局

2. **AccountCategoryModal**
   - 使用 Tabs 替代两个独立表格
   - 移除了"类型"列和"现金等价物"列
   - 移除了现金等价物配置功能（保留在 CashFlowConfigModal）
   - 优化了操作按钮布局

3. **CashFlowConfigModal**
   - 保持现有功能不变
   - 专注于现金流量表配置

4. **api.ts**
   - 添加了 categoryApi.updateSort 方法

### 代码变更统计
- 修改文件：3个
- 新增功能：拖拽排序
- 移除冗余代码：约 50 行

---

## 备注

- 本次优化不提交到 git 仓库
- 完成后进行全面功能测试
- 保持三个设置页面的职责边界清晰
