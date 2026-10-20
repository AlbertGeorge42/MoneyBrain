# MoneyBrain 重写蓝图：架构、代码风格与 UX

> 前提：不考虑迁移成本，允许推倒重来。目标只有一个——**让“算对钱”成为结构上不可能出错的事，让新增功能不再复制金额逻辑。**
> 本文是目标态设计，不是对现有代码的修补清单。现状问题见 `docs/audit-report.md`。
> 实施进度：npm workspaces、`apps/{api,web}`、`packages/{domain,contracts}` 目录迁移已完成；余额/收支/预算/分析已接入 domain，导入覆盖与投资快照链已加固。剩余 `packages/db`、`packages/ui`、zod 契约与 feature 切片按本蓝图继续。

---

## 0. 一页纸结论

| 维度 | 重写前 | 目标 |
|---|---|---|
| 金额语义 | 5 个 service 各自解释 `refund/transfer/fee` | **一个 `ledger` 包**：交易 → 分录（posting）→ 所有报表皆为投影 |
| 日期 | `Date` 带时分秒 + 各服务自己拼月末 | **`LocalDate`（YYYY-MM-DD）+ 半开区间**，领域层不出现时区 |
| 金额 | `Decimal` 在各层流转 | **整数分（minor units）+ `Money` 值对象**，UI 边界才格式化 |
| 仓库 | `frontend/ backend/ shared/` 三包，各自安装 | **npm workspaces**：`apps/web`、`apps/api`、`packages/{domain,contracts,db,ui}` |
| API 契约 | 前端 `api.ts` 内联 + 后端手写，靠人同步 | **zod 契约单一来源**，前端类型与表单校验共用 |
| 后端分层 | routes 厚薄不一，service 混 CRUD 与预测 | **模块化**：`modules/<domain>/{route,service,repo,schema}`，领域纯函数在 `packages/domain` |
| 前端分层 | pages 直接拼 queries + 巨型组件 | **feature 切片**，每 feature 自带 api/hooks/components/schema |
| 状态 | 每个 mutation 手工列 invalidate，常漏 | **单一 `ledger` 版本键**，所有派生查询挂在它下面 |
| 导航 | 5 个平级入口，报表 4 个 tab 各自日期 | **Flow / Stock / Plan / Insight 四象限**，报表共享一个全局期间 |
| 交互 | 确认弹窗多、无撤销、无快捷录入 | **可撤销优先**、全局快速记账、下钻可解释 |
| UI | AntD 直接用，内联样式多 | **语义令牌 + `ui` 包装层**，金额等宽数字、克制的色彩语义 |

三句话：

1. **把复式记账引入内核，但不暴露给用户。** 用户仍然只看到“支出/收入/转账/退款/平账”，系统内部统一变成借贷分录。
2. **不持久化任何派生值。** 余额、预算进度、快照前链、收益率全部按需计算；算错只可能错在一个地方。
3. **交互的核心是“可解释 + 可撤销”。** 每个数字都能点开看公式和原始流水，每次写操作都能一键撤回。

---

## 1. 设计不变量（任何实现都必须满足）

这 6 条应写成自动化测试，CI 不通过就不许合并：

1. `期末净资产 − 期初净资产 == 净收入 − 净支出`（同一期间、同一口径）。
2. `Σ 所有账户余额 == 净资产`。
3. 任意交易：`Σ postings.amount == 0`（复式平衡）。
4. 退款：`退款后余额 == 原交易前余额`（全额退款时），且退款额 ≤ 可退余额。
5. 转账：`Δ转出 + Δ转入 == −fee`。
6. 同一笔交易在余额、收支表、现金流量表、预算、投资分析中的“归属”可追溯到同一条 posting。

> 这 6 条对应的正是现有 P0/P1 的全部根因。只要内核正确，UI 怎么写都不会算错钱。

---

## 2. 领域模型：交易 → 分录（Posting）

### 2.1 为什么不是“按 type 分支算金额”

现有实现的事实是：`refund` 的符号、`transfer` 的手续费、`initialBalanceDate` 的边界，在每个消费方都要重新判断一次。**只要“交易类型 → 金额影响”是一段 if/else，它就会被复制。**

复式记账把这件事变成数据：交易产生一组**有符号的分录**，之后所有报表只是对不同维度求和。

### 2.2 类型草图

```ts
// packages/domain/src/money.ts
export type Minor = number & { readonly __brand: 'Minor' } // 整数，单位：分
export type Currency = 'CNY'

// packages/domain/src/date.ts
export type LocalDate = string & { readonly __brand: 'LocalDate' } // '2026-10-20'
export interface Period { start: LocalDate; endExclusive: LocalDate }

// packages/domain/src/ledger/types.ts
export type AccountId = string & { readonly __brand: 'AccountId' }
export type CategoryId = string & { readonly __brand: 'CategoryId' }

export interface Posting {
  accountId: AccountId
  /** 有符号：正数增加该账户余额，负数减少 */
  amount: Minor
  /** 仅用于损益/现金流分类；资产账户的内部划转可为空 */
  categoryId?: CategoryId
  memo?: string
}

export type Transaction =
  | { kind: 'income';     id: string; date: LocalDate; accountId: AccountId; categoryId: CategoryId; amount: Minor; note?: string }
  | { kind: 'expense';    id: string; date: LocalDate; accountId: AccountId; categoryId: CategoryId; amount: Minor; note?: string }
  | { kind: 'transfer';   id: string; date: LocalDate; from: AccountId; to: AccountId; principal: Minor; fee: Minor; note?: string }
  | { kind: 'refund';     id: string; date: LocalDate; originalId: string; accountId: AccountId; amount: Minor; note?: string }
  | { kind: 'adjustment'; id: string; date: LocalDate; accountId: AccountId; delta: Minor; note?: string }
```

### 2.3 五类交易的分录规则（唯一实现）

```ts
export function toPostings(tx: Transaction, ctx: LedgerContext): Posting[] {
  switch (tx.kind) {
    case 'income':
      return [
        { accountId: tx.accountId, amount: tx.amount },
        { accountId: ctx.incomeAccount, categoryId: tx.categoryId, amount: neg(tx.amount) },
      ]
    case 'expense':
      return [
        { accountId: tx.accountId, amount: neg(tx.amount) },
        { accountId: ctx.expenseAccount, categoryId: tx.categoryId, amount: tx.amount },
      ]
    case 'transfer':
      return [
        { accountId: tx.from, amount: neg(add(tx.principal, tx.fee)) },
        { accountId: tx.to,   amount: tx.principal },
        { accountId: ctx.expenseAccount, categoryId: ctx.feeCategoryId, amount: tx.fee },
      ]
    case 'refund': {
      const original = ctx.mustGet(tx.originalId)
      const sign = original.kind === 'income' ? -1 : 1 // 收入退款=钱流出；支出退款=钱流回
      return [
        { accountId: tx.accountId, amount: mul(tx.amount, sign) },
        { accountId: ctx.contraAccount(original), categoryId: original.categoryId, amount: mul(tx.amount, -sign) },
      ]
    }
    case 'adjustment':
      return [
        { accountId: tx.accountId, amount: tx.delta },
        { accountId: ctx.equityAccount, amount: neg(tx.delta) },
      ]
  }
}
```

要点：

- **手续费天然只扣一次**：转出 `principal+fee`，转入 `principal`，差额自动是 `−fee`。
- **退款方向由原交易决定**，不依赖调用方记得传 `relatedType`。
- **期初余额不是特例**：它是一条 `opening` 分录，日期为 `openingOn`，`balanceAt(date)` 用 `date <= d` 的自然包含，不再有“初始日当天交易被排除”的窗口。
- **平账**走权益账户，不再污染收入/支出。
- 未来要支持**一笔支出拆多个分类**，只需一条交易产生多条 expense posting；现有模型完全兼容。

### 2.4 所有报表都是投影

```ts
// 余额：唯一公式
balanceAt(accountId, d) = opening + Σ postings[accountId].amount where date <= d

// 收支表：按分类类型聚合 posting
income  = −Σ postings[category.type='income'].amount
expense =  Σ postings[category.type='expense'].amount

// 现金流量表：只看现金账户的 posting，用“对手方分类”的 cashFlowType 归类
// 无分类 → uncategorized 桶，永远显示，不再从合计里消失

// 预算：Σ expense postings in (category subtree, account scope, period)
// 退款自动成为负数 posting，无需额外“抵扣”逻辑

// 投资外部现金流：投资账户 posting 中，对手方为外部账户的部分
// 手续费是独立 posting，不再混入本金
```

> 现有 `balance.service` / `income-expense.service` / `cash-flow-*` / `budget.service` / `investment-analysis-*` 的计算职责，在目标态全部收敛到 `packages/domain/src/ledger/` 下的 5 个纯函数。API 层只负责取数、调用、组装 DTO。

### 2.5 测试策略

- **属性测试**（fast-check）：随机生成交易序列，断言第 1 节的 6 条不变量。
- **黄金用例**：一组固定账本 → 四张报表的 JSON 快照；任何计算改动都会产生 diff。
- **回归用例**：直接覆盖现有 P0/P1 场景（收入退款、含手续费转账、期初日当天交易、月末 23:59 预算、部分退款）。

---

## 3. 数据与类型规范

### 3.1 金额：整数分

| 决策 | 说明 |
|---|---|
| 存储 | `INTEGER` 分（SQLite 64 位足够） |
| 领域 | `Minor` 品牌类型，禁止裸 `number` |
| 传输 | JSON number（分），或字符串（大额/多币种时） |
| 展示 | 仅在 `formatMoney()` 中除以 100，`Intl.NumberFormat` |
| 禁止 | 领域层出现 `parseFloat` / `toFixed` / `Decimal` |

理由：加减乘除全是整数，不存在精度漂移；报表对账可以用 `===`。

### 3.2 日期：LocalDate + 半开区间

| 决策 | 说明 |
|---|---|
| 交易日期 | `occurred_on DATE`（无时分秒） |
| 期初 | `opening_on DATE` + `opening_balance_minor` |
| 期间 | `[start, endExclusive)`，**永远半开** |
| 领域层 | 只认 `LocalDate` 字符串，禁止 `Date` |
| 时间戳 | 仅 `created_at/updated_at/deleted_at` 用于审计，不参与计算 |
| UI | 所有选择器输出 `YYYY-MM-DD`；"今天"由 UI 注入 |

这一条单独消灭：初始日边界、月末 23:59、UTC 零点、跨时区导入。

### 3.3 ID / 审计 / 删除

- ID：**UUIDv7**（按时间有序，索引友好）。
- 每张业务表带 `created_at/updated_at`；交易额外 `deleted_at`（软删除）。
- **审计事件表**：`audit_events(entity, entity_id, action, before, after, at)`，支撑撤销、历史查看和"这笔钱怎么变的"。
- 导入任务表 `import_jobs` + 行级指纹，保证幂等。

### 3.4 Schema v2（核心表）

```text
account_categories(id, name, type, parent_id, is_cash_equivalent, sort)
accounts(id, name, type, category_id, currency, opening_on, opening_balance_minor, archived_at, sort)

transaction_categories(id, name, type, parent_id, cash_flow_type, sort)
transactions(id, kind, occurred_on, note, created_at, updated_at, deleted_at)
postings(id, transaction_id, account_id, category_id, amount_minor, memo)   ← 核心
transaction_links(transaction_id, related_transaction_id, relation)          ← refund_of / split_of

budgets(id, name, period, start_on, end_on, account_id, category_id, amount_minor, rollover, is_active)
investment_snapshots(id, account_id, as_of, note, created_at)                ← 不再存 previous_snapshot_id
investment_holdings(id, snapshot_id, asset_class_id, market_value_minor, cost_basis_minor, sort)

settings(key, value_json, updated_at)
audit_events(...)
import_jobs(id, filename, fingerprint, status, result_json, created_at)
```

关键删除项：`previous_snapshot_id`、任何 `balance` 缓存列、任何 `refund_amount` 冗余列。

---

## 4. 仓库结构

### 4.1 Monorepo

```text
moneybrain/
├── apps/
│   ├── api/                  # Fastify + tRPC/ts-rest + Drizzle
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── accounts/{route,service,repo,schema}.ts
│   │       │   ├── transactions/…
│   │       │   ├── budgets/…
│   │       │   ├── reports/…
│   │       │   ├── investments/…
│   │       │   └── backup/…
│   │       ├── plugins/      # db, logger, error, auth
│   │       └── server.ts
│   └── web/                  # Vite + React + TanStack Router
│       └── src/
│           ├── app/          # providers, router, boundaries
│           ├── routes/       # 文件路由，只做页面装配
│           ├── features/
│           │   ├── transactions/{api.ts,components/,hooks.ts,schema.ts}
│           │   ├── accounts/…
│           │   ├── budgets/…
│           │   ├── reports/…
│           │   ├── investments/…
│           │   └── settings/…
│           └── shared/{ui,lib,hooks,styles}
├── packages/
│   ├── domain/               # 纯 TS：ledger, money, date, period, budget, investment, fixtures
│   ├── contracts/            # zod schema + 路由契约 + 错误码
│   ├── db/                   # Drizzle schema, migrations, seed, repositories
│   └── ui/                   # 设计系统（tokens + 基础组件包装）
├── e2e/                      # Playwright
├── docs/
└── package.json（workspaces） / turbo.json
```

### 4.2 依赖方向（用 ESLint boundaries 强制）

```text
apps/web  →  packages/contracts, packages/ui, packages/domain(仅类型/纯函数)
apps/api  →  packages/contracts, packages/db, packages/domain
packages/db → packages/domain(类型)
packages/domain → 无外部依赖（禁止 react/express/prisma/node:fs）
packages/ui → 无业务依赖
```

**规则**：`domain` 不知道数据库、HTTP、React 的存在。它是可以单独发布、单独测试的“记账内核”。

### 4.3 后端模块模板

每个模块四件套，职责固定：

```text
modules/transactions/
├── route.ts     # 只做：解析输入(zod) → 调 service → 映射输出；禁止 if (type === ...)
├── service.ts   # 用例编排：鉴权/事务边界/调用 domain/写 repo
├── repo.ts      # 只做 SQL/Drizzle 查询，不写业务判断
└── schema.ts    # 该模块的请求/响应 schema（引用 contracts）
```

禁止：route 里出现金额计算；service 里出现 `new Date()`；repo 里出现 `if (kind === 'refund')`。

### 4.4 前端 feature 模板

```text
features/transactions/
├── api.ts          # 由 contracts 生成的类型化调用 + query hooks
├── schema.ts       # 表单 zod（与 API 共用）
├── components/     # 只属于本 feature 的组件
├── hooks.ts        # useTransactionFilters / useCreateTransaction
└── index.ts        # 对外只导出页面需要的 1-2 个入口
```

规则：

- feature 之间**不互相 import**，共享能力下沉到 `shared/`。
- 页面（`routes/`）只做布局装配，不写业务逻辑。
- 禁止 `components/` 大杂烩；组件跟 feature 走。

---

## 5. API 契约

### 5.1 单一来源

`packages/contracts` 用 zod 定义每个端点的输入/输出：

```ts
export const createTransactionInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('expense'), date: localDate, accountId: id, categoryId: id, amount: minor, note: z.string().max(500).optional() }),
  z.object({ kind: z.literal('transfer'), date: localDate, from: id, to: id, principal: minor, fee: minor.default(0) }),
  // ...
])
export type CreateTransactionInput = z.infer<typeof createTransactionInput>
```

同一份 schema 同时用于：后端请求校验、前端表单校验、OpenAPI 文档、测试 fixture。

**推荐方案**：ts-rest / oRPC 这类 contract-first（自动生成类型化客户端 + OpenAPI）。若确定永远只有 Web 一个客户端，tRPC 也可，但文件上传/导出仍走 REST。

### 5.2 错误模型

```json
{ "error": { "code": "REFUND_EXCEEDS_REMAINING", "message": "退款金额超过可退余额", "details": { "remaining": 1200 }, "requestId": "..." } }
```

- 错误码集中在 `contracts/errors.ts`，前端按 code 映射文案。
- 领域层抛 `DomainError(code, details)`；API 层统一转 problem+json；前端统一 toast/表单错误。
- **禁止**用字符串 message 做分支判断。

### 5.3 列表与查询

- 游标分页（`cursor`, `limit`），不用 offset。
- 统一过滤参数：`from/to/accountIds/categoryIds/kinds/q/includeExcluded`。
- 报表端点只接收 `period` + `scope`，不接收零散日期。

---

## 6. 代码风格与工程规范

### 6.1 命名词典（Ubiquitous Language）

先定词，再写代码。**一个概念只能有一个名字**：

| 概念 | 统一用 | 禁止 |
|---|---|---|
| 一笔收支记录 | `transaction` | `record`, `bill`, `entry`（entry 仅指 posting） |
| 分录 | `posting` | `line`, `detail` |
| 账户 | `account` | `wallet`, `card` |
| 分类 | `category` | `class`, `tag` |
| 转账 | `transfer` | `move`, `remit` |
| 退款 | `refund` | `reimburse`, `return` |
| 平账 | `adjustment` | `balanceFix`, `reconcile`（reconcile 是动作） |
| 预算 | `budget` | `plan`, `envelope` |
| 投资快照 | `snapshot` | `valuation`, `allocation`（allocation 是持仓分布） |
| 持仓 | `holding` | `position`, `item` |
| 资产类别 | `assetClass` | `assetType` |
| 期初余额 | `openingBalance` | `initialBalance` |

规则：

- 类型不加 `Data/Info/DTO` 后缀：`IncomeStatement`，不是 `IncomeExpenseReportData`。
- 布尔用 `is/has/can/should`；事件用过去式；纯函数用名词（`balanceAt`、`postingsFor`）。
- 缩写只允许 `id`、`db`、`api`、`ui`；禁止 `tx/amt/cat/acc`。
- 中文只出现在 UI 文案与注释里，标识符全英文。

### 6.2 类型与函数

- `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`。
- 领域层优先**纯函数 + 不可变数据**；不引入 class/DI 容器。
- 边界处解析（zod），内部信任类型；禁止 `as` 断言（允许 `satisfies`）。
- `Result<T, E>` 只用于“预期内的失败”（校验、余额不足）；异常用于 bug。
- 所有导出函数写 JSDoc（一句话说明“做什么/边界”），不写废话注释。

### 6.3 文件与导出

- **一个文件一个主要导出**，文件名 = 导出名（组件 `PascalCase.tsx`，hook `useX.ts`，其余 `kebab-case.ts`）。
- 禁止 `index.ts` 桶导出（package 公共入口除外）——桶会制造循环依赖、拖慢构建、让“类型从哪来”变模糊。
- 组件用 `function Foo(props: FooProps)`，**不用 `React.FC`**；用 named export，路由级组件才 `default`。
- Props：`onX` 回调、`isX` 布尔、弹层统一 `open`（不用 `visible`）。

### 6.4 错误与日志

- 前端：错误边界（路由级）+ `QueryState`（局部）+ toast（动作反馈）三层，不允许“静默 0”。
- 后端：请求日志带 `requestId`；领域错误不打 error 级；未知异常打 error 并带堆栈。
- 日志字段统一 `event`, `entity`, `entityId`, `durationMs`。

### 6.5 工具链

| 项 | 选择 | 理由 |
|---|---|---|
| 包管理 | npm workspaces | 与现有工具链一致，零额外安装器 |
| 任务编排 | Turborepo | 增量构建/缓存 |
| 格式化 + lint | **Biome** | 一个工具、极快；替代 ESLint+Prettier 两套配置 |
| 类型检查 | `tsc --noEmit`（每包） | CI 强制 |
| 测试 | Vitest + Testing Library + Playwright + MSW | 与现有生态一致 |
| 提交 | Conventional Commits + changesets（可选） | 可读的变更历史 |
| CI 门禁 | typecheck → lint → unit → integration → e2e → build | 顺序固定，失败即停 |

Biome 统一配置（示例）：单引号、无分号、尾逗号、行宽 100。**风格由工具决定，不写进 code review。**

---

## 7. 前端技术选型与状态

| 关注点 | 选择 | 说明 |
|---|---|---|
| 框架 | React 19 + Vite | 本地优先 SPA，不需要 SSR |
| 路由 | **TanStack Router** | 类型安全的 search params，天然承载筛选/期间状态 |
| 服务端状态 | TanStack Query | 保留；配 `QueryState` 与统一失效 |
| 客户端状态 | 仅 shell 用 Zustand（可选） | 主题/侧栏；业务状态不进全局 |
| 表单 | React Hook Form + zod | 与 contracts 共用 schema |
| 表格 | TanStack Table | 列配置、虚拟化、排序 |
| 图表 | ECharts（保留） | 包一层 `<Chart spec>`，禁止业务组件直接写 option |
| UI 库 | Ant Design 6 + 包装层 | 保留成熟表格/日期/表单；**不混用第二套** |
| 样式 | CSS Modules + 语义 tokens | 禁止内联样式（动态值除外） |
| i18n | i18next（从第一天接入） | 即使只有中文，也避免文案散落 |

### 7.1 缓存与失效：一个键解决

```ts
// 所有派生数据都挂在 ledger 版本下
queryKey: ['ledger', ledgerVersion, 'reports', 'income-statement', period]
```

任何写操作（交易/账户/预算/导入）只做一件事：`invalidateQueries({ queryKey: ['ledger'] })`。

- 优点：**不可能漏**（现有 P1-9 的根因就是手工列举失效键）。
- 代价：一次写操作会多刷几个查询；个人账本数据量下完全可接受。
- 进阶：需要时再按 `['ledger', 'transactions']` 细化，但**默认全失效**是安全的。

### 7.2 查询状态组件

```tsx
<QueryState
  query={transactionsQuery}
  loading={<TableSkeleton />}
  error={(e, retry) => <ErrorPanel error={e} onRetry={retry} />}
  empty={<EmptyState action={<AddTransactionButton />} />}
>
  {(data) => <TransactionTable data={data} />}
</QueryState>
```

强制所有页面使用；code review 看到 `?? 0` 兜底金额直接打回。

---

## 8. 设计系统

### 8.1 原则

1. **金额是主角**：等宽数字（`tabular-nums`）、右对齐、千分位、负数用 `−` 而非 `-`。
2. **色彩只表达方向**：收入绿、支出红、转账蓝、退款青、平账灰；分类颜色只用于图标/图表，不用于表格文字。
3. **一屏一个主数字**：每页只有一个 hero 指标，其余降级。
4. **密度可选**：桌面提供“舒适/紧凑”，移动端固定舒适。
5. **暗色不是反色**：单独校验对比度与图表色板。

### 8.2 Tokens

```css
:root {
  /* 语义色（禁止业务代码直接用 hex） */
  --mb-income: …; --mb-expense: …; --mb-transfer: …; --mb-refund: …; --mb-adjustment: …;
  --mb-positive: …; --mb-negative: …; --mb-neutral: …;
  --mb-surface: …; --mb-surface-raised: …; --mb-border: …; --mb-text: …; --mb-text-muted: …;

  /* 间距 4px 网格、字号阶梯、圆角、阴影、动效 */
  --mb-space-1: 4px; … --mb-space-8: 48px;
  --mb-radius-sm/md/lg;
  --mb-duration-fast: 120ms; --mb-duration-base: 180ms;
}
```

### 8.3 组件清单（`packages/ui`）

`MoneyText`、`MoneyInput`（计算器 + 正负号）、`DateField`、`PeriodPicker`（唯一日期组件）、`AccountPicker`、`CategoryPicker`、`DataTable`、`Stat`、`ProgressRing`、`Sheet`（移动端）、`ConfirmDialog`、`UndoToast`、`EmptyState`、`ErrorPanel`、`PageHeader`、`Segmented`。

**所有业务代码只用这些包装组件**，不直接 import AntD 的 `Modal/DatePicker/Table`。这样换 UI 库或统一交互时只改一层。

### 8.4 文案规范

- 金额一律带单位/符号，不出现裸数字。
- 日期语义显式：“截至 2026-10-20”“2026 年 10 月”“期初（10-01 开始时）”。
- 错误文案三段式：**发生了什么 + 为什么 + 怎么办**。
- “未分类”是合法状态，不写成“未知”。

---

## 9. 信息架构与导航

### 9.1 心智模型：Flow / Stock / Plan / Insight

| 象限 | 页面 | 回答的问题 |
|---|---|---|
| Flow | 流水 | 钱最近怎么进出的？ |
| Stock | 资产 | 我现在有多少？分布在哪？ |
| Plan | 预算 | 接下来能花多少？ |
| Insight | 报表 | 这个月/年发生了什么？为什么？ |

### 9.2 导航

**桌面（侧栏，6 项）**：首页 · 流水 · 预算 · 报表 · 资产 · 设置

**移动（底部 5 项 + 悬浮 +）**：首页 · 流水 · ＋ · 预算 · 报表
- 资产：从首页“净资产”卡片进入
- 设置：右上角头像/齿轮进入

理由：移动端底部栏不超过 5 个主入口；“资产”是低频高价值页面，放在首页入口更符合“先看总数再看结构”的行为。

### 9.3 页面职责

| 页面 | 必须有 | 不再有 |
|---|---|---|
| 首页 | 净资产 hero、本月收支、储蓄率、预算预警、最近流水、快速记账 | 4 张报表的缩略图堆叠 |
| 流水 | 搜索、类型 chips、账户/分类/日期筛选、分组、批量、行内编辑、下钻详情 | 每次筛选都点“查询”才生效 |
| 资产 | 资产/负债分组、账户余额、对账入口、投资持仓与快照、收益解释 | 把投资分析藏在报表 tab 里 |
| 预算 | 信封卡片、进度环、预计超支、滚动结转、下钻流水 | 预算与流水条件不一致 |
| 报表 | **一个全局期间**、4 张表切换、口径说明、对账条、导出、下钻 | 每张表各自记日期 |
| 设置 | 子路由：账户/分类/投资/数据/外观 | 巨型单页 + 报表页内嵌配置弹窗 |

---

## 10. 关键交互设计

### 10.1 快速记账（最高频路径）

目标：**3 秒内记完一笔**。

- 全局快捷键 `N`（桌面）/ 悬浮 `＋`（移动）/ 命令面板 `⌘K`。
- 打开紧凑 composer（桌面右侧面板，移动底部 Sheet）：
  1. 类型 Segmented（默认上次类型）
  2. 金额（自动聚焦，支持 `12+8` 计算）
  3. 分类（最近 6 个优先，可搜索）
  4. 账户（默认上次使用）
  5. 日期（今天；快捷 chip：今天/昨天/前天）
  6. 备注（可选）
- “更多”折叠：手续费、优惠券、不计收支、标签。
- 保存后：`已记录 ¥35.00 · 撤销`（5 秒）。
- 连续记账模式：保存后保持 composer 打开、金额清空（适合补录）。

### 10.2 编辑与删除：撤销优先

- 单条删除 → 软删除 + UndoToast，不弹确认。
- 批量删除/清空/覆盖导入 → 必须二次确认，且要求输入数量或名称。
- 编辑采用**乐观更新**：列表立即变化，失败回滚并 toast。
- 所有写操作记录 `audit_events`，详情页可看“修改历史”。

### 10.3 退款流程

- 只能从原交易发起（详情页“退款”或搜索原交易）。
- 自动带出：原账户、原分类、可退余额；金额默认剩余全额。
- 实时提示：`可退 ¥120.00，本次退 ¥50.00`。
- 提交后原交易显示“已退 ¥50 / ¥120”，退款单独成行但视觉从属。

### 10.4 转账

- 转出/转入账户并排；金额下方实时显示“到账金额”。
- 手续费是**独立字段**，默认 0；旁边解释“手续费计入支出”。
- 保存前展示影响预览：`A −105.00 / B +100.00 / 手续费 5.00`。

### 10.5 报表

- **一个期间控件**控制四张表；切换 tab 不改变期间。
- 顶部“口径”标签：`实际` / `含预算预测`，点开解释差异。
- **对账条**常驻：`期初净资产 + 净收入 − 净支出 = 期末净资产`；不等时显示“差异 ¥x，查看原因”。
- 每个分类可下钻到过滤后的流水（携带相同期间/账户/分类）。
- 未分类作为一个显式分类节点，永远可见。
- 导出当前视图（CSV/图片），导出内容与屏幕一致。

### 10.6 预算

- 卡片显示：已用/总额、进度环、剩余、按当前速度的月末预测。
- 超支不只变红，显示“超出 ¥x（预计 ¥y）”。
- “查看流水”携带期间+账户+分类，条数与预算用量一致。
- 支持结转（rollover）与暂停。

### 10.7 投资

- 快照 = 持仓列表 + 现金/未分类余额；**差额自动成为一行“现金/未分类”**，不再阻断保存。
- 快照链由 `as_of` 排序推导，不持久化 `previousSnapshotId`。
- 收益展示三层：累计收益、年化（XIRR）、时间加权（TWR），每个都有“怎么算的”气泡。
- 外部现金流（转入/转出）单独列出，手续费不混入本金。

### 10.8 导入/导出

- 导入前**预览**：将新增/更新/跳过多少条，冲突样例，可下载 diff。
- 覆盖模式：先自动生成回滚点，再执行；完成后提供“撤销本次导入”。
- 导入幂等：同一文件重复导入 → 0 新增。
- 导出格式带 `version` 与 `exportedAt`；字段完整（含不计收支、标签、退款关联）。

### 10.9 反馈层级

| 场景 | 形式 |
|---|---|
| 成功 | Toast + 撤销（可撤销时） |
| 表单校验 | 字段内联错误，不用 toast |
| 可恢复失败 | 页面内 ErrorPanel + 重试 |
| 系统级失败 | 顶部 Banner（离线/后端不可达） |
| 破坏性操作 | ConfirmDialog（需输入确认） |

**禁止**：用 toast 承载需要用户决策的信息；用 modal 承载可以内联的提示。

---

## 11. 页面级改造清单

### 首页
- 净资产 hero + 环比/同比（口径可切换）
- 本月收入/支出/储蓄率三卡
- 预算预警（Top 3，只显示 >80% 或预计超支）
- 最近 8 条流水（可展开）
- 快速记账入口 + 空态引导
- “数据健康”提示：未分类交易、未对账账户、上次备份时间

### 流水
- 顶部固定搜索 + 类型 chips + 高级筛选（Sheet）
- 按日分组，组头显示当日合计
- 桌面表格支持列配置、密度切换、行内编辑、批量选择
- 移动卡片列表，左滑删除（带撤销）
- 详情：桌面右侧抽屉，移动全屏 Sheet；含修改历史

### 资产
- 资产/负债两个分区，组内按分类折叠
- 每个账户：余额、占比、最近变动、对账按钮
- 投资账户：持仓表、配置偏离、快照时间线、收益卡片

### 预算
- 顶部总览（总预算/已用/剩余）
- 信封卡片网格（移动单列）
- 详情：期间、账户、分类、进度、预测、下钻流水

### 报表
- 全局期间 + 口径
- 4 个报表用 Segmented 切换（不是独立 tab 各带日期）
- 对账条 + 导出 + 下钻

### 设置
- 子路由：`/settings/accounts`、`/settings/categories`、`/settings/investments`、`/settings/data`、`/settings/appearance`
- 数据页：自动备份开关、上次备份、恢复点列表、导入预览
- 危险区独立，输入确认

---

## 12. 移动端

- 表单一律 **底部 Sheet**，不用全屏 Modal；保存按钮吸底，避让安全区。
- 触控目标 ≥ 44×44；列表行高 ≥ 56。
- 金额键盘：数字键盘 + 运算符；不允许滚动页面时误触。
- 日期选择：一个组件、一个交互（底部滚轮 + 快捷 chip），全站一致。
- 图表：移动端只保留 1 个主图，其余折叠为数字。
- 手势：左滑删除（撤销）、下拉刷新（可选）。
- 横屏/大字体：布局不塌，金额不截断。

---

## 13. 可访问性与信任设计

- 键盘可达：Tab 顺序、Esc 关闭、焦点回到触发元素；列表支持 `j/k`、`e` 编辑、`Delete` 删除。
- 对比度 AA；颜色不是唯一信号（收入/支出同时有 `+/−` 与文字）。
- `prefers-reduced-motion` 关闭非必要动画。
- 屏幕阅读器：金额读作“收入 35 元”，不是“三十五”。
- 信任：每个关键数字可点开“计算说明”；导入/覆盖/清空有回滚点；显示“上次备份”。

---

## 14. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| domain | Vitest + fast-check | 6 条不变量、五类交易、期间边界、退款上限 |
| contracts | Vitest | schema 解析/拒绝、错误码 |
| api | Vitest + 临时 SQLite | 每个模块的 happy path + 关键失败 |
| web | Testing Library + MSW | 表单、查询状态、空/错态 |
| e2e | Playwright | 6 条主旅程：引导、记账、退款、转账、预算、导入导出 |
| 迁移 | 脚本 | v1 导出 → v2 导入 → 对账报告 |

CI 顺序固定：`typecheck → lint → unit → integration → e2e → build`。

---

## 15. 重写顺序（垂直切片）

即使不考虑成本，也建议按“能独立验证”的顺序做，否则无法判断对错：

1. **domain + 测试**（无 UI、无 DB）：ledger、money、date、period、budget、investment。
2. **contracts**：所有端点 schema、错误码。
3. **db v2 + 迁移器**：schema、seed、v1→v2 转换、对账报告。
4. **api 骨架**：插件（db/log/error）、transactions + accounts 两个模块，跑通端到端。
5. **web 骨架**：路由、设计系统、`QueryState`、快速记账。
6. **按 feature 推进**：流水 → 资产 → 预算 → 报表 → 投资 → 备份/设置。
7. **E2E 与迁移回归**：用真实 v1 备份跑一遍，确认数字可解释。

每个切片结束都应能回答：**这笔钱在 5 个视图里是否一致？**

---

## 16. 数据迁移（v1 → v2）

这是重写最容易翻车的地方，必须显式定义：

| v1 字段 | v2 处理 |
|---|---|
| `transactions.amount`（已合并 fee/coupon） | 普通收支：直接作为金额；转账：`principal = amount − fee + coupon`，`fee` 独立 |
| `transactions.fee/coupon` | 保留；转账时用于还原本金 |
| `refund.amount` | 原样保留；若 `fee/coupon != 0`，标记 `legacyAmountAmbiguous` 并在迁移报告中列出（历史编辑可能已膨胀） |
| `initialBalanceDate/initialBalance` | 生成 `opening` posting，日期 = 原日期，**当天交易照常计入** |
| `excludeFromIncomeExpense` | 保留为 posting/transaction 标志 |
| `investment_snapshots.previousSnapshotId` | 丢弃，按 `as_of` 重排 |
| `cashFlowType` | 保留；空的归入 `uncategorized` |

迁移后输出一份**对账报告**：每个账户 v1 余额 vs v2 余额、差异原因、受影响的交易数。用户确认后才切换。

---

## 17. 反模式清单（写进 code review checklist）

- ❌ 在 React 组件里算钱；在 route 里算钱。
- ❌ 用 `number` 存金额、用 `Date` 存交易日期。
- ❌ 持久化余额、预算百分比、快照前链、收益率。
- ❌ 每个 mutation 手工列 `invalidateQueries`。
- ❌ 用字符串 message 判断错误类型。
- ❌ `index.ts` 桶导出（package 入口除外）。
- ❌ 同一概念两个名字（`flow/transaction`、`allocation/holding`）。
- ❌ 弹窗套弹窗；报表页里改配置。
- ❌ 失败时渲染 0。
- ❌ 混用两套 UI 库。
- ❌ 为“未来可能的多币种/多用户”提前造抽象（真需要时 postings 模型已经能承接）。

---

## 18. 关键决策记录（ADR 摘要）

| # | 决策 | 理由 | 放弃的方案 |
|---|---|---|---|
| 1 | 内部复式记账（postings） | 一处定义金额影响，五处消费 | 按 type 分支（现状） |
| 2 | 金额用整数分 | 精确、可比较、无 Decimal 依赖 | Decimal / float |
| 3 | 交易只存日期 | 消灭时区与边界 bug | timestamp |
| 4 | 期间半开区间 | 无“最后一秒”遗漏 | `lte 23:59:59.999` |
| 5 | 单一 monorepo + domain 包 | 纯函数可测、边界可强制 | 前后端各自复制逻辑 |
| 6 | 契约优先（zod） | 类型/校验/文档同源 | 手写 api.ts + 后端 DTO |
| 7 | 派生值不落库 | 不会出现“两个真相” | 余额缓存列、快照链 |
| 8 | 默认全量失效 `['ledger']` | 不会漏刷 | 手工枚举 queryKey |
| 9 | AntD + 包装层 | 复杂表格/日期成熟，改造成本低 | 重写整套 UI 组件 |
| 10 | 撤销优先于确认 | 更少打断、更快 | 每步都弹确认 |

---

## 附：一句话验收

> 新成员只看 `packages/domain/ledger` 就能说出“退款和转账手续费怎么算”，并且能在 10 分钟内加一种新交易类型而不用改报表——这时架构才算成立。
