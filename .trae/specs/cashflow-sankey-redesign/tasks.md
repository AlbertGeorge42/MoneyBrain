# Tasks

## 第一阶段：后端 API 修改

- [ ] Task 1: 修改现金流量 API
  - [ ] SubTask 1.1: 添加按分类分组的流入数据
  - [ ] SubTask 1.2: 添加按分类分组的流出数据
  - [ ] SubTask 1.3: 添加按账户分组的流入流出数据
  - [ ] SubTask 1.4: 构建桑基图节点和链接数据

## 第二阶段：前端页面修改

- [ ] Task 2: 修改 Reports.tsx 桑基图
  - [ ] SubTask 2.1: 修改 SankeyChart 组件支持节点分类着色
  - [ ] SubTask 2.2: 使用新的数据结构绘制桑基图
  - [ ] SubTask 2.3: 添加节点分类颜色配置

## 第三阶段：验证

- [ ] Task 3: 验证功能
  - [ ] SubTask 3.1: 运行后端类型检查
  - [ ] SubTask 3.2: 运行前端类型检查
  - [ ] SubTask 3.3: 测试桑基图显示

# Task Dependencies
- Task 2 依赖 Task 1（后端 API 完成后再修改前端）
- Task 3 依赖 Task 1-2（所有修改完成后验证）
