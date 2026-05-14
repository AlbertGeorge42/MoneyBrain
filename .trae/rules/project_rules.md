# MoneyBrain 项目开发规则

## 项目概述

MoneyBrain 是一款个人记账软件，支持资产负债管理、收支记录、财务报表生成与分析。

## 技术栈

- 前端: React 18 + TypeScript + Vite + Ant Design 6 + ECharts + Zustand + dnd-kit
- 后端: Node.js + Express + TypeScript + Prisma + SQLite
- 测试: Vitest（单元/集成测试）+ Playwright（E2E测试）

## 目录结构

```
MoneyBrain/
├── frontend/              # 前端应用
│   ├── src/
│   │   ├── components/    # React 组件
│   │   │   ├── charts/    # 图表组件
│   │   │   ├── common/    # 通用组件
│   │   │   ├── reports/   # 报表组件
│   │   │   ├── settings/  # 设置组件
│   │   │   └── transactions/  # 交易组件
│   │   ├── layouts/       # 布局组件
│   │   ├── pages/         # 页面组件
│   │   ├── services/      # API 服务
│   │   ├── stores/        # Zustand 状态管理
│   │   ├── styles/        # 样式文件
│   │   │   ├── base/      # 基础样式
│   │   │   ├── layout/    # 布局样式
│   │   │   ├── components/ # 组件样式
│   │   │   ├── pages/     # 页面样式
│   │   │   ├── themes/    # 主题配置
│   │   │   └── tokens/    # 设计令牌
│   │   └── utils/         # 工具函数
│   ├── tests/             # 前端测试
│   └── scripts/           # 构建脚本
├── backend/               # 后端应用
│   ├── src/
│   │   ├── common/        # 通用模块
│   │   ├── routes/        # API 路由
│   │   └── services/      # 业务逻辑服务
│   ├── prisma/            # Prisma 配置
│   └── tests/             # 后端测试
├── shared/                # 共享代码
│   ├── types/             # 共享类型定义
│   └── utils/             # 共享工具函数
├── e2e/                   # E2E 测试
│   ├── tests/             # E2E 测试文件
│   ├── fixtures/          # 测试数据
│   └── helpers/           # 测试辅助函数
├── docs/                  # 项目文档
│   ├── plan.md            # 项目计划
│   └── testing.md         # 测试文档
├── playwright.config.ts   # Playwright E2E 测试配置
└── .trae/rules/           # 项目规则
```

## 开发命令

### 根目录 (/)

```bash
npm run install:all      # 安装前后端所有依赖
npm run dev              # 同时启动前后端开发服务器
npm run build            # 构建前后端生产版本
npm run test             # 运行所有测试
npm run test:e2e         # 运行 E2E 测试
npm run test:e2e:ui      # 运行 E2E 测试 (UI 模式)
```

### 前端 (frontend/)

```bash
npm install              # 安装依赖
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm run lint             # 运行 ESLint
npm run typecheck        # TypeScript 类型检查
npm run generate:theme   # 生成主题变量 CSS
npm run test             # 运行所有前端测试
npm run test:coverage    # 运行测试并生成覆盖率报告
npm run test:watch       # 监听模式运行测试
```

### 后端 (backend/)

```bash
npm install              # 安装依赖
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm start                # 启动生产服务器
npm run lint             # 运行 ESLint
npm run typecheck        # TypeScript 类型检查
npm run db:migrate       # 运行数据库迁移
npm run db:studio        # 打开 Prisma Studio 数据库管理界面
npm run db:seed          # 运行数据库种子数据
npm run test             # 运行所有后端测试
npm run test:unit        # 运行单元测试
npm run test:integration # 运行集成测试
npm run test:coverage    # 运行测试并生成覆盖率报告
npm run test:watch       # 监听模式运行测试
```

## 代码规范

### 命名约定

- 组件文件: PascalCase (如 `AccountList.tsx`)
- 工具函数: camelCase (如 `formatCurrency.ts`)
- API路由: kebab-case (如 `account-category.route.ts`)
- CSS 类名: kebab-case (如 `app-shell__brand`)

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

## 样式规范

### 目录结构

```
styles/
├── base/              # 全局基础样式
│   ├── reset.css      # 重置样式
│   └── typography.css # 基础文本样式
├── layout/            # 页面布局样式
│   ├── appShell.css   # 应用壳布局
│   ├── pageShell.css  # 页面壳布局
│   └── grids.css      # 网格布局
├── components/        # 可复用 UI 组件样式
├── pages/             # 页面专属样式
├── themes/            # 主题定义
│   ├── light.ts       # 浅色主题
│   └── dark.ts        # 深色主题
├── tokens/            # 设计令牌
│   ├── colors.ts
│   ├── spacing.ts
│   ├── typography.ts
│   ├── borders.ts
│   ├── shadows.ts
│   ├── radius.ts
│   ├── motion.ts      # 动画
│   ├── zIndex.ts      # 层级
│   └── layout.ts      # 布局
├── antd-theme.ts      # Ant Design 主题配置
├── antd-overrides.css # Ant Design 覆盖样式
└── global.css         # 样式入口（仅导入）
```

### 样式归属规则

- **全局基础样式** → `base/`
- **页面布局壳** → `layout/`
- **可复用 UI 组件样式** → `components/`
- **页面专属样式** → `pages/`
- **Ant Design 覆盖样式** → `antd-overrides.css`
- **所有样式属性值优先使用 token，不直接硬编码**

### 设计令牌使用

所有样式属性值必须使用设计令牌：
- 颜色: `var(--mb-color-*)`
- 间距: `var(--mb-space-*)`
- 字体: `var(--mb-font-size-*)`
- 圆角: `var(--mb-radius-*)`
- 阴影: `var(--mb-shadow-*)`
- 动画: `var(--mb-motion-*)`
- 层级: `var(--mb-z-*)`

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

- 每次修改 schema 后执行 `npm run db:migrate`
- 迁移文件提交到版本控制

## 测试规范

### 测试架构

- **单元测试**: Vitest，测试单个函数/组件
- **集成测试**: Vitest，测试模块间协作
- **E2E 测试**: Playwright，测试完整用户流程

### 测试命令

```bash
# 根目录
npm run test          # 运行所有测试
npm run test:e2e      # 运行 E2E 测试

# 前端
npm run test          # 运行所有前端测试
npm run test:coverage # 生成测试覆盖率报告

# 后端
npm run test:unit     # 运行单元测试
npm run test:integration # 运行集成测试
```

## 开发流程

### 新功能开发

1. 查看 docs/plan.md 了解项目计划
2. 查看 docs/testing.md 了解测试策略
3. 开发完成后确保测试通过
4. 运行 lint 和 typecheck 确保代码质量
5. 手动测试关键功能（深色模式、响应式布局等）

### 问题解决

1. 遇到问题时记录到相关文档
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

### 主题与响应式

- 支持浅色/深色主题切换
- 支持桌面端、平板端、移动端响应式布局
- 使用 CSS 变量实现主题切换
- 使用设计令牌统一视觉风格

## Git规范

### 提交规则

- **禁止自动提交**: 未经用户明确要求，不得执行 `git commit` 或 `git push` 操作
- 用户明确要求时才可进行代码提交
