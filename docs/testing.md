# MoneyBrain 测试系统使用文档

## 概述

MoneyBrain 测试系统采用多层级测试策略，覆盖从单元测试到端到端测试的完整链路：

| 测试层级 | 工具 | 范围 | 位置 |
|---------|------|------|------|
| 后端单元测试 | Vitest | Common 模块、Service 层 | `backend/tests/unit/` |
| 后端集成测试 | Vitest + Supertest | API 路由、数据库交互 | `backend/tests/integration/` |
| 前端单元测试 | Vitest + React Testing Library | 组件、Hooks、Store | `frontend/tests/` |
| 端到端测试 | Playwright | 完整用户流程 | `e2e/tests/` |

## 快速开始

### 安装依赖

```bash
# 安装所有依赖（前后端）
npm run install:all

# 安装 Playwright 浏览器（首次运行 E2E 测试前）
npx playwright install
```

### 运行测试

```bash
# 运行所有测试
npm test

# 仅后端测试
cd backend && npm test

# 仅前端测试
cd frontend && npm test

# 端到端测试
npm run test:e2e

# E2E 测试（UI 模式）
npm run test:e2e:ui

# E2E 测试（调试模式）
npm run test:e2e:debug
```

### 运行覆盖率报告

```bash
# 后端覆盖率
cd backend && npm run test:coverage

# 前端覆盖率
cd frontend && npm run test:coverage
```

覆盖率报告将生成在 `coverage/` 目录下，可打开 `coverage/index.html` 查看详细报告。

## 后端测试

### 单元测试

后端单元测试使用 Vitest，重点测试不依赖数据库的纯逻辑函数：

```bash
cd backend
npm run test:unit
```

测试范围：
- `common/utils.ts` — 工具函数（hasValue, toDecimal, parsePositiveInteger 等）
- `common/validators.ts` — 请求验证器
- `common/tree.ts` — 树形结构构建
- `common/error.ts` — 错误类
- `services/*.ts` — 业务逻辑（使用 Mock Prisma）

### 集成测试

集成测试使用 Supertest 发送真实 HTTP 请求，验证 API 完整链路：

```bash
cd backend
npm run test:integration
```

测试范围：
- 所有 RESTful API 端点
- 请求验证与错误响应
- 数据库状态变更

### 测试数据工厂

使用工厂函数创建测试数据：

```typescript
import { createAccountFactory, createTransactionFactory } from './factories'

const account = createAccountFactory({ name: '测试账户', balance: 1000 })
const transaction = createTransactionFactory({ type: 'expense', amount: 100 })
```

## 前端测试

### 组件测试

前端测试使用 React Testing Library，以用户视角测试组件：

```bash
cd frontend
npm test
```

测试范围：
- `components/common/` — 通用组件渲染与交互
- `components/charts/` — 图表组件
- `pages/` — 页面级组件
- `stores/` — Zustand 状态管理
- `utils/` — 工具函数

### Mock 配置

测试环境已配置以下 Mock：
- `matchMedia` — 媒体查询 API
- `ResizeObserver` / `IntersectionObserver` — 观察者 API
- `antd message/notification` — Ant Design 提示组件
- `echarts-for-react` — 图表组件

## 端到端测试

E2E 测试使用 Playwright 模拟真实浏览器操作：

```bash
# 运行所有 E2E 测试
npm run test:e2e

# 运行特定测试文件
npx playwright test e2e/tests/onboarding.spec.ts

# 特定浏览器
npx playwright test --project=chromium-desktop
```

### 测试场景

| 测试文件 | 场景 |
|---------|------|
| `onboarding.spec.ts` | 创建账户分类 -> 创建账户 -> 记录交易 -> 查看报表 |
| `theme.spec.ts` | 主题切换（浅色/深色/系统） |
| `responsive-desktop.spec.ts` | 桌面端布局验证 |
| `responsive-mobile.spec.ts` | 移动端布局与导航 |

### 视口配置

Playwright 配置支持多视口测试：
- `chromium-desktop` — 1280x720（桌面端）
- `tablet` — 1024x768（平板端）
- `mobile` — 375x667（移动端）

## CI/CD 集成

GitHub Actions 工作流配置在 `.github/workflows/test.yml`，包含：

1. **Backend Test Job**
   - 类型检查 (`tsc --noEmit`)
   - ESLint 检查
   - 单元测试与集成测试
   - 覆盖率报告上传

2. **Frontend Test Job**
   - 类型检查
   - ESLint 检查
   - 单元测试
   - 覆盖率报告上传

3. **E2E Test Job**
   - 依赖前后端测试通过
   - Playwright 端到端测试
   - 测试报告与截图上传

### 触发条件

- `push` 到 `main` 或 `develop` 分支
- `pull_request` 到 `main` 或 `develop` 分支

## 测试数据管理

### 数据库隔离策略

| 测试类型 | 数据库 |
|---------|--------|
| 后端单元测试 | Prisma Mock（无真实数据库） |
| 后端集成测试 | `prisma/test.db`（独立测试数据库） |
| 前端单元测试 | Mock API（无后端依赖） |
| E2E 测试 | 开发数据库（通过 API 清理数据） |

### 数据清理

E2E 测试使用 `clearAllTestData()` 辅助函数清理数据：

```typescript
import { clearAllTestData } from '../helpers/test-data'

test.beforeEach(async () => {
  await clearAllTestData()
})
```

## 常见问题

### 后端测试

**Q: 如何 Mock Prisma Client？**
A: 使用 `createMockPrisma()` 工厂函数创建 Mock 对象：

```typescript
import { createMockPrisma } from '../mocks/prisma'
const mockPrisma = createMockPrisma()
```

**Q: 集成测试数据库如何初始化？**
A: 首次运行前执行：
```bash
cd backend
npx prisma migrate dev --name init
```

### 前端测试

**Q: 组件中使用了 Ant Design 组件，测试时报错？**
A: 测试环境已自动 Mock `message` 和 `notification`，其他组件正常渲染。

**Q: 如何测试使用了 Zustand Store 的组件？**
A: 直接渲染组件并在测试中操作 UI，Store 状态会自动更新。

### E2E 测试

**Q: Playwright 浏览器安装失败？**
A: 尝试使用系统依赖安装：
```bash
npx playwright install --with-deps
```

**Q: 如何查看 E2E 测试报告？**
A: 测试完成后运行：
```bash
npx playwright show-report
```

## 目录结构

```
MoneyBrain/
├── backend/
│   ├── tests/
│   │   ├── unit/              # 单元测试
│   │   ├── integration/       # 集成测试
│   │   ├── factories/         # 测试数据工厂
│   │   ├── mocks/             # Mock 辅助
│   │   └── helpers/           # 测试辅助函数
│   ├── vitest.config.ts       # Vitest 配置
│   ├── vitest.unit.config.ts  # 单元测试配置
│   └── vitest.integration.config.ts # 集成测试配置
│
├── frontend/
│   ├── tests/
│   │   ├── unit/              # 单元测试
│   │   │   ├── components/    # 组件测试
│   │   │   ├── stores/        # Store 测试
│   │   │   └── utils/         # 工具函数测试
│   │   └── mocks/             # Mock 辅助
│   └── vitest.config.ts       # Vitest 配置
│
├── e2e/
│   ├── tests/                 # E2E 测试用例
│   ├── fixtures/              # 测试夹具
│   └── helpers/               # 测试辅助函数
│
├── playwright.config.ts       # Playwright 配置
└── .github/workflows/test.yml # CI/CD 配置
```
