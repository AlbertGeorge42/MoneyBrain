# Tasks

## 第一阶段：公共组件抽取

- [x] Task 1: 创建公共图表组件
  - [x] SubTask 1.1: 创建 `components/charts/PieChart.tsx` 环形图组件
  - [x] SubTask 1.2: 创建 `components/charts/BarChart.tsx` 柱状图组件
  - [x] SubTask 1.3: 创建 `components/charts/LineChart.tsx` 折线图组件
  - [x] SubTask 1.4: 创建 `components/charts/SankeyChart.tsx` 桑基图组件
  - [x] SubTask 1.5: 创建 `components/charts/index.ts` 导出文件

## 第二阶段：资产负债表图表

- [x] Task 2: 资产负债表添加图表
  - [x] SubTask 2.1: 添加资产结构环形图（展示各资产分类占比）
  - [x] SubTask 2.2: 添加负债结构环形图（展示各负债分类占比）
  - [x] SubTask 2.3: 调整布局为"上图表下表格"结构

## 第三阶段：收入支出表图表

- [x] Task 3: 收入支出表添加图表
  - [x] SubTask 3.1: 添加收入vs支出柱状图
  - [x] SubTask 3.2: 添加收入分类环形图
  - [x] SubTask 3.3: 添加支出分类环形图
  - [x] SubTask 3.4: 调整布局为"左图表右表格"结构

## 第四阶段：现金流量表图表

- [x] Task 4: 现金流量表添加图表
  - [x] SubTask 4.1: 添加三类现金流柱状图（经营/投资/筹资）
  - [x] SubTask 4.2: 添加现金流净额分布环形图
  - [x] SubTask 4.3: 调整布局结构

## 第五阶段：验证

- [x] Task 5: 验证功能
  - [x] SubTask 5.1: 运行前端类型检查（预存问题与新功能无关）
  - [x] SubTask 5.2: 图表组件创建完成
  - [x] SubTask 5.3: Reports页面图表集成完成

# Task Dependencies
- Task 2-4 依赖 Task 1（先创建公共图表组件）
- Task 5 依赖 Task 1-4（所有图表完成后验证）
