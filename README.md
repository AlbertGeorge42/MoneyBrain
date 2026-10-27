# MoneyBrain

个人记账软件。本地 SQLite、单用户、数据不出本机。
前端 React + Vite，后端 Express + Prisma，金额计算收敛到一个纯 TypeScript 领域内核。

**核心约束：同一笔钱只允许有一套算法。** 余额、收支表、现金流量表、预算、投资分析最终都是同一组分录的投影，因此不会出现「首页和报表数字对不上」。

> **现状提示**：账户余额、首页汇总与收支报表已走领域内核（`summarizeFlows` / `flowByCategory`）；预算用量与现金流量表已接入规则层（`scopeQuery` / `rulesFor`）；资产负债表与投资分析仍各有独立汇总实现。收口计划见 [docs/rewrite-blueprint.md](docs/rewrite-blueprint.md) 批次 A0。

> **本文是唯一入口。** 无论你是人还是 AI 协作者，都从这份文档开始：先看「文档索引」确定该读哪一篇，再按「动手前」清单准备。

## 快速开始

```bash
npm install     # 安装全部 workspace（postinstall 会自动 prisma generate）
npm run dev     # 前后端一起启动：API :3001，前端 :3002
```

打开 http://localhost:3002 即可。首次使用请先在「设置 → 账户」创建账户，再在「交易」记第一笔。

生产构建：

```bash
npm run build   # 构建 web + api
npm start       # 预览构建产物
```

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 前后端一起启动 |
| `npm run dev:api` / `npm run dev:web` | 单独启动 |
| `npm run build` | 构建 web + api |
| `npm run lint` | lint api + web |
| `npm run typecheck` | domain + api + web |
| `npm test` | domain + api + web 测试 |
| `npm run test:e2e` | Playwright（**会清空开发数据库，先备份 `apps/api/prisma/dev.db`**） |
| `npm run db:migrate` | 改 schema 后生成并应用版本化迁移（SQL 进仓库） |
| `npm run db:status` | 查看当前库与迁移的差异 |
| `npm run db:verify` | 数据自检：重算净资产恒等式、转账与退款，报告不一致项 |
| `npm run db:drill` | 恢复演练：导出 → 导入临时库 → 对比余额（备份可信度自检） |

单独跑某一层：`npm run test:domain` / `npm run test:api` / `npm run test:web`。

## 目录

```
MoneyBrain/
├── apps/
│   ├── api/                # Express + Prisma API（routes → services → domain）
│   └── web/                # React + Vite SPA（pages → queries → services/api）
├── packages/
│   ├── domain/             # 记账内核：金额、日期、分录、汇总（算钱的唯一位置）
│   └── contracts/          # 前后端共享的 API 类型与错误码
├── e2e/                    # Playwright 端到端测试
├── docs/                   # 详见下方文档索引
└── scripts/build.mjs       # 跨平台构建封装
```

## 不可违反的领域规则

1. **金额影响只有一个实现**：所有余额、收支、预算、退款计算必须经过
   `packages/domain` 的 `postingsOf` / `summarizeFlows` / `remainingRefundable`。
   组件、route、service 里不得再写 `if (type === 'refund')` 之类的金额分支。
   （投资分析只统计转账本金，是已知例外，收口见蓝图批次 A0；新代码不得再复制这类分支。）
2. **金额单位**：DB / API / 契约 / 前端全链路都是整数分（`Minor`）；
   只有用户输入框与文件（CSV / 备份）按元读写。
3. **日期单位**：领域层用 `LocalDate`（YYYY-MM-DD）；期间一律半开
   `[start, endExclusive)`。禁止在业务代码里拼 `23:59:59.999`。
4. **期初余额**：视为「期初日期当天开始前」的余额，当天交易必须计入。
5. **转账**：`amount` 是本金，`fee/coupon` 单独存放；手续费只从转出账户扣除。
6. **退款**：必须关联原交易，金额不得超过剩余可退金额；方向由原交易类型决定。
7. **不持久化派生值**：余额、预算百分比、快照前链、收益率一律按需计算。
8. **失败不得伪装成空数据**：接口失败时用 `ErrorState` 展示原因与重试，
   金额显示 `—` 而不是 `0`；前端只通过 `unwrapApiData(res)` 解包响应，
   禁止 `res.data.data!` / `res.data.data ?? []`。错误码只能取
   `packages/contracts` 的 `ApiErrorCode`，错误体带 `requestId`。

## 动手前

1. **读规范**：[docs/dev-guide.md](docs/dev-guide.md)（怎么写代码）。
2. **找代码**：[docs/architecture.md](docs/architecture.md)（东西在哪、怎么流动）。
3. **对口径**：[docs/requirements.md](docs/requirements.md)（这个数字应该等于什么）。
4. **排计划**：[docs/rewrite-blueprint.md](docs/rewrite-blueprint.md)（该做什么、还差什么）。

改代码时：注释中文、标识符英文；新组件用 `function Foo(props: FooProps)`，不用 `React.FC`；
优先 named export；不新增桶导出；禁止 `as` 断言（`satisfies` 可以）。

改完必须跑：

```bash
npm run test:domain && npm run lint && npm run typecheck && npm test && npm run build
```

涉及后端 schema 时额外跑 `npm run test:integration -w @moneybrain/api`。

**禁止自动 git commit / push**，除非明确要求。

## 文档索引

| 文档 | 回答什么 | 什么时候读 |
|---|---|---|
| [docs/requirements.md](docs/requirements.md) | 做什么产品、账务口径（交易语义/期间/预算/报表/导入导出）、设计原则、信息架构 | 讨论需求、判断某个数字对不对 |
| [docs/architecture.md](docs/architecture.md) | 现在代码怎么组织：分层、领域内核、后端模块、前端数据流、数据库模型 | 找代码在哪、改动会影响谁 |
| [docs/dev-guide.md](docs/dev-guide.md) | 新代码必须怎么写：领域规则、命名、文件与导出、类型、错误协议、数据库、测试要求 | **动手写代码前必读** |
| [docs/testing.md](docs/testing.md) | 测试放在哪、怎么跑、Mock 策略、不变量的覆盖情况 | 加测试、跑验证 |
| [docs/rewrite-blueprint.md](docs/rewrite-blueprint.md) | 目标态长什么样、还差什么、按什么顺序改、关键决策与反模式 | 规划下一批工作、判断改动该不该做 |

### 冲突时以谁为准

1. **当前可执行的规范以 [docs/dev-guide.md](docs/dev-guide.md) 为准。**
2. [docs/rewrite-blueprint.md](docs/rewrite-blueprint.md) 是**计划**：它与现状不一致时不是 bug，而是待办。
3. [docs/requirements.md](docs/requirements.md) 是**账务口径的权威**。代码与它不一致时，代码是错的（除非先改需求）。
4. 每个文档只负责一个视角；同一事实只在一个文档里写，不重复、不交叉。

### 维护规则

- 文件名 kebab-case；文档必须与代码一致，不一致就改文档或改代码，不留「以后再说」。
- **过时文档直接删除，不保留历史副本**（历史在 git 里）。
- 改代码时同步改受影响的文档；新增文档必须登记进上方索引。
- 目标态内容必须明确标注「目标」，现状内容不得混入计划。
- 文档里的文件路径、命令、测试数量必须与仓库一致；不确定就先查再写。
