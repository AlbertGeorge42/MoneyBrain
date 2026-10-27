# MoneyBrain 架构（当前实现）

> 本文回答**现在代码是怎么组织的**。目标态与待办见 [rewrite-blueprint.md](rewrite-blueprint.md)，编码约定见 [dev-guide.md](dev-guide.md)。
> 本文只描述**已落地**的事实；不写计划，不写历史。

## 1. 分层总览

```
React SPA (apps/web)
   │  TanStack Query + Axios
   ▼
Express API (apps/api)
   │  参数校验 / 用例编排 / 事务
   ▼
packages/domain（纯函数，算钱的唯一位置）
   │  money.ts · date.ts · ledger/{types,postings,summary,rules,rules.v1}.ts
   ▼
Prisma → SQLite
```

领域层不依赖 React、Express、Prisma、Node API。API 只负责取数、调用领域函数、组装 DTO。

### 依赖方向

```text
apps/web  →  packages/contracts, packages/domain（仅类型/纯函数）
apps/api  →  packages/contracts, packages/domain
packages/domain → 无外部依赖
```

当前后端用相对路径导入领域包（`../../../../packages/domain/src/index.js`），避免开发期额外构建步骤；`tsc` 会把 `packages/domain` 一起编译到 `apps/api/dist/packages/domain`。

## 2. 记账内核（packages/domain）

| 模块 | 职责 |
|---|---|
| `money.ts` | 整数分金额 `Minor`；`add/sub/neg/sum/min/max`、`fromMajor/toMajor`、`parseAmount` |
| `date.ts` | `LocalDate`（`YYYY-MM-DD`）；`localDate/today/compare/isBefore`、期间 `periodOf`、半开区间工具 |
| `ledger/types.ts` | `LedgerTransaction`、`TransactionKind`、`Posting`、`OpeningBalance` |
| `ledger/postings.ts` | **交易 → 分录**：`postingsOf`（按交易的 `ruleVersion` 取规则）、`accountDelta`、`balanceAt`、`balanceBefore` |
| `ledger/summary.ts` | **分录 → 报表**：`summarizeFlows`、`flowByCategory`、`remainingRefundable` |
| `ledger/rules.ts` | **口径规则唯一来源**：版本注册表（`rulesFor` / `registerRuleSet`）、`CURRENT_RULE_VERSION` |
| `ledger/rules.v1.ts` | **口径 v1 的冻结实现**：计入哪些类型、退款冲减哪侧、账户与分类如何匹配、分录怎么生成 |

分录规则（口径定义见 [requirements.md](requirements.md) §3.1，实现见 `ledger/rules.v1.ts` 的 `postingsOf`）：

```text
income      账户 +amount      分类 −amount
expense     账户 −amount      分类 +amount
transfer    转出 −(本金+fee)   转入 +本金    手续费 +fee
refund      支出退款 账户 +amount；收入退款 账户 −amount
adjustment  账户 +amount      权益 −amount
```

记账不变量（6 条）及其测试覆盖情况见 [rewrite-blueprint.md](rewrite-blueprint.md) §2 与 [testing.md](testing.md) §5.1。

> 领域层与后端之间的适配在 `apps/api/src/services/ledger.adapter.ts`（Prisma `BigInt` 分 ↔ 领域类型）。

## 3. 后端模块（apps/api/src）

| 位置 | 职责 |
|---|---|
| `routes/*.route.ts` | 参数解析、校验、委托 service；不写业务判断、不算钱 |
| `services/account*.service.ts` | 账户与账户分类 CRUD、级联清理 |
| `services/transaction.service.ts` | 交易创建/更新/删除；退款上限调用领域层 `remainingRefundable` |
| `services/balance.service.ts` | 批量余额（走 `balanceBefore` / `postingsOf`） |
| `services/budget.service.ts` | 预算 CRUD、状态、预测；统计类型与冲减口径来自领域层规则（`scopeQuery`） |
| `services/analytics.service.ts` | 首页汇总、趋势、分类占比（走 `summarizeFlows` / `flowByCategory`） |
| `services/report/*` | 四张报表；收支表用领域层 `summarizeFlows` / `flowByCategory` |
| `services/import/*`、`services/export/*` | 备份/CSV 导入导出；幂等键、范围过滤、覆盖保护 |
| `services/investment/*` | 资产类型、快照链、收益分析 |
| `services/ledger.adapter.ts` | Prisma `BigInt` 分 ↔ 领域类型适配 |
| `common/` | 错误、HTTP 信封、请求 ID、日期、校验器、日志、树工具 |

## 4. 前端数据流（apps/web/src）

```
Page → queries/useXxx → services/api.ts → Axios → Express
                                    ← ApiResponse<T>（判别联合）
```

| 位置 | 职责 |
|---|---|
| `pages/` | 5 个页面：Dashboard、Transactions、Budgets、Reports、Settings |
| `queries/` | React Query hooks；写操作统一调用 `invalidateLedger(queryClient)` |
| `services/api.ts` | Axios 实例 + API 对象 + 响应拦截器（统一归一化错误） |
| `services/apiError.ts` | `ApiClientError`：所有失败的标准形态 |
| `services/apiResult.ts` | `unwrapApiData(res)`：唯一的响应解包入口 |
| `components/` | 按领域分目录：`common/ transactions/ budgets/ reports/ investment/ settings/ charts/` |
| `hooks/` | `useNotify`、`useIsMobile`、`usePersistedState`、`useSearchParamsState` 等 |
| `styles/` | 主题令牌（`styles/theme/`）与页面样式，语义变量 `--mb-*` |

**缓存失效**：所有派生数据（余额、收支、报表、预算、分析、投资）都来自同一份交易，
因此写操作统一失效 `ledger` 根键（`queries/ledger.ts`），不允许各 mutation 手写 key 列表。

**错误处理**：拦截器把任何失败归一化为 `ApiClientError`；查询 hook 用 `unwrapApiData` 解包，
失败一定抛错，不会变成空列表；页面用 `components/common/ErrorState.tsx` 展示原因与重试。

## 5. 数据库模型

Prisma + SQLite，`apps/api/prisma/schema.prisma`。金额字段为 `BigInt`（整数分），ID 为 `uuid`。

**schema 演进走版本化迁移**（`apps/api/prisma/migrations/`）：改 schema 执行 `npm run db:migrate`，
生成的 SQL 提交进仓库；`npm run db:status` 查看当前库与迁移的差异。
测试库由 `tests/global-setup.ts` 用同一套迁移重建。

备份文件带 `schemaVersion`（导出时最新一条已应用的迁移名）：比当前应用新的备份会被拒绝导入，
更旧的在兼容模式下导入并记一条警告。

| 模型 | 说明 |
|---|---|
| `AccountCategory` | 账户分类（资产/负债），树形；`isCashEquivalent`、`isInvestment` |
| `Account` | 账户；`initialBalance` + `initialBalanceDate` 即期初余额 |
| `TransactionCategory` | 收支分类（收入/支出），树形；`cashFlowType` 决定现金流量表归类 |
| `Transaction` | 交易；`type` 五选一；`fee`/`coupon` 独立；`importKey` 唯一用于导入幂等；`relatedTransactionId` 关联退款；`excludeFromIncomeExpense` 表示不计收支 |
| `Budget` | 预算；账户 + 分类 + 周期 + 额度 |
| `InvestmentAssetClass` | 投资资产类型与目标比例 |
| `InvestmentAllocationSnapshot` | 投资快照；`previousSnapshotId` 为派生链，写入后重排 |
| `InvestmentAllocationItem` | 快照内的持仓市值与期间净流入 |

数据库不存派生值：余额、预算百分比、快照前链、收益率全部按需计算。

## 6. 错误与请求链路

```
前端拦截器 → ApiClientError(code, message, details, requestId)
                    ▲
后端 errorHandler ← AppError / Prisma 错误映射
   请求头 x-request-id ──→ 响应头 x-request-id ──→ 错误体 error.requestId ──→ 后端日志
```

- 每个请求由 `common/request-id.ts` 分配 ID（复用上游 `x-request-id`，否则生成 UUID）。
- 错误码只有 `packages/contracts` 里的 `ApiErrorCode` 几种，前后端共用。
- 未匹配的 `/api/*` 路径也返回同一信封（`NOT_FOUND`），不返回 HTML。

## 7. 已知技术债

现状与目标之间的差距，完整清单见 [rewrite-blueprint.md](rewrite-blueprint.md) §4。这里只列**会影响正确性或数据安全**的：

| 债 | 位置 | 后果 |
|---|---|---|
| 投资分析仍有一份自己的口径（只统计转账本金） | `services/report/investment-analysis-collect.ts` | 与其它报表口径不同属设计选择，但没有单测兜底 |
| 决定数字的路径大多没有单测：投资分析、备份、清库 | `apps/api/tests/unit/` | 口径改动没有安全网（预算、收支表、现金流、退款上限、备份版本已有测试） |
| SQLite 未显式配置 WAL / `busy_timeout`，写操作未串行化 | `src/prisma.ts` | 多标签页并发写可能 "database is locked" |

**对账与自检**：

- 收入支出表返回 `reconciliation`（期初 + 净收入 − 净支出 + 其他 = 期末，差额应为 0），前端常驻显示。
- `npm run db:verify` 用同一套规则离线复核整本账；`npm run db:drill` 验证备份能还原出同样的余额。

## 8. 端口与运行

- 后端 `3001`，前端 `3002`（Vite 代理 `/api` → `127.0.0.1:3001`）。
- API 默认只监听 `127.0.0.1`；需要局域网访问时显式设置 `HOST=0.0.0.0`，并用 `CORS_ORIGINS` 配置允许来源（逗号分隔）。
- 根目录 `npm run build` 由 `scripts/build.mjs` 串行构建；在 Windows 上把 `TEMP`/`TMP` 指向仓库内临时目录，避开 esbuild 清理系统临时目录的权限问题。
