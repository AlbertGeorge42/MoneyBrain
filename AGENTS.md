# MoneyBrain Agent Guide

个人记账软件。本地 SQLite、单用户、前后端 TypeScript、npm workspaces。

## 仓库结构

```
MoneyBrain/
├── apps/
│   ├── web/              # React + Vite SPA
│   └── api/              # Express + Prisma API
├── packages/
│   ├── domain/           # 纯记账内核（金额、日期、分录、汇总）— 单一事实来源
│   └── contracts/        # 前后端 API 类型、树工具
├── e2e/                  # Playwright 端到端测试
└── docs/                 # 文档（看 docs/README.md）
```

目标结构中的 `packages/db`、`packages/ui` 尚未拆出；`apps/*` 与 `packages/*` 已经就位。

## 命令

```bash
npm install                 # 安装全部 workspace
npm run dev                 # 前后端一起启动（3001 / 3002）
npm run build               # 构建 web + api
npm run lint                # lint api + web
npm run typecheck           # domain + api + web
npm test                    # domain + api + web 测试
npm run test:e2e            # Playwright
```

单独运行：

```bash
npm run dev:api
npm run dev:web
npm run test:api
npm run test:web
npm run test:domain
```

等价于：

```bash
cd apps/api  && npm run test:unit && npm run typecheck
cd apps/web  && npm test && npm run typecheck
cd packages/domain && npm test
```

## 不可违反的领域规则

1. **金额影响只有一个实现**：所有余额、收支、预算、退款计算必须经过
   `packages/domain` 的 `postingsOf` / `summarizeFlows` / `budgetUsage`。
   组件、route、service 里不得再写 `if (type === 'refund')` 之类的金额分支。
2. **金额单位**：领域层用整数分（`Minor`）；`Decimal` 只允许出现在 Prisma 边界。
3. **日期单位**：领域层用 `LocalDate`（YYYY-MM-DD）；期间一律半开
   `[start, endExclusive)`。禁止在业务代码里拼 `23:59:59.999`。
4. **期初余额**：视为「期初日期当天开始前」的余额，当天交易必须计入。
5. **转账**：`amount` 是本金，`fee/coupon` 单独存放；手续费只从转出账户扣除。
6. **退款**：必须关联原交易，金额不得超过剩余可退金额；方向由原交易类型决定。
7. **不持久化派生值**：余额、预算百分比、快照前链、收益率一律按需计算。

## 代码风格

- 代码注释中文，标识符英文；一个概念一个名字（见 `docs/dev-guide.md` 词典）。
- 新组件用 `function Foo(props: FooProps)`，**不使用 `React.FC`**；优先 named export。
- 新文件一个主要导出，文件名 = 导出名；不新增桶导出（现有例外逐步清理）。
- 禁止 `as` 断言（`satisfies` 可以）；边界处用 schema 解析。
- 无分号、单引号；格式化以仓库现状为准，后续统一交给 Biome。
- 测试顺序：`domain → lint → typecheck → test`。
- **禁止自动 git commit/push**，除非用户明确要求。

## 详细文档

- [docs/rewrite-blueprint.md](docs/rewrite-blueprint.md) — 目标架构与 UX
- [docs/audit-report.md](docs/audit-report.md) — 问题清单与优先级
- [docs/dev-guide.md](docs/dev-guide.md) — 开发规范
- [docs/architecture.md](docs/architecture.md) — 架构与数据流
- [docs/testing.md](docs/testing.md) — 测试指南
- [docs/README.md](docs/README.md) — 文档索引
