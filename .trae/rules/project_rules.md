# MoneyBrain 项目开发规则

## 项目概述

MoneyBrain 是一款个人记账软件，支持资产负债管理、收支记录、财务报表生成与分析。

## 技术栈

- 前端: React 18 + TypeScript + Vite + Ant Design + ECharts + Zustand
- 后端: Node.js + Express + TypeScript + Prisma + SQLite

## 目录结构

```
MoneyBrain/
├── frontend/           # 前端应用
├── backend/            # 后端应用
├── docs/               # 项目文档
│   ├── spec.md         # 规格说明
│   ├── tasks.md        # 任务分解
│   └── checklist.md    # 检查清单
└── .trae/rules/        # 项目规则
```

## 开发命令

### 前端 (frontend/)

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run lint         # 运行 ESLint
npm run typecheck    # TypeScript 类型检查
```

### 后端 (backend/)

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run lint         # 运行 ESLint
npm run typecheck    # TypeScript 类型检查
npx prisma migrate dev   # 运行数据库迁移
npx prisma studio        # 打开数据库管理界面
```

## 代码规范

### 命名约定

- 组件文件: PascalCase (如 `AccountList.tsx`)
- 工具函数: camelCase (如 `formatCurrency.ts`)
- API路由: kebab-case (如 `account-category.ts`)

### 注释语言

- 代码注释使用中文
- 变量和函数命名使用英文

### 组件结构

```tsx
// 1. 导入
import React from 'react';

// 2. 类型定义
interface ComponentProps {
  // ...
}

// 3. 组件定义
const Component: React.FC<ComponentProps> = (props) => {
  // 3.1 Hooks
  // 3.2 事件处理
  // 3.3 渲染
  return (
    // JSX
  );
};

// 4. 导出
export default Component;
```

## API规范

### 统一响应格式

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}
```

### RESTful路由

- GET /api/resources - 获取列表
- GET /api/resources/:id - 获取详情
- POST /api/resources - 创建
- PUT /api/resources/:id - 更新
- DELETE /api/resources/:id - 删除

## 数据库规范

### Prisma使用

- 所有数据库操作通过 Prisma Client
- 使用 UUID 作为主键
- 金额使用 Decimal 类型
- 时间字段使用 DateTime

### 迁移规范

- 每次修改 schema 后执行 `npx prisma migrate dev`
- 迁移文件提交到版本控制

## 开发流程

### 新功能开发

1. 查看 docs/spec.md 了解功能规格
2. 查看 docs/tasks.md 确认任务详情
3. 开发完成后更新 docs/checklist.md
4. 运行 lint 和 typecheck 确保代码质量

### 问题解决

1. 遇到问题时记录到 checklist.md 的问题记录表
2. 解决后更新状态

## 注意事项

### AI开发友好

- 保持代码简洁，避免过度抽象
- 每个模块功能单一，职责清晰
- 重要逻辑添加注释说明
- 避免复杂的类型体操

### 数据安全

- 数据存储在本地 SQLite
- 提供数据导出备份功能
- 不涉及用户认证(单用户应用)

### 性能考虑

- 列表数据分页加载
- 图表数据按需加载
- 避免不必要的状态更新

## Git规范

### 提交规则

- **禁止自动提交**: 未经用户明确要求，不得执行 `git commit` 或 `git push` 操作
- 用户明确要求时才可进行代码提交

