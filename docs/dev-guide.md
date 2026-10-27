# MoneyBrain 开发规范

> 本文回答**新代码必须怎么写**。这是**当前可执行的唯一规范**。
> 代码现状见 [architecture.md](architecture.md)，账务口径见 [requirements.md](requirements.md)，计划见 [rewrite-blueprint.md](rewrite-blueprint.md)。
> 与计划冲突时以本文为准。

## 1. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18、Vite 5、TypeScript、Ant Design 6、ECharts、TanStack Query、Axios |
| 后端 | Express 4、TypeScript、Prisma 5、SQLite、pino / pino-http |
| 领域内核 | 纯 TypeScript（`packages/domain`，无框架、无数据库依赖） |
| 契约 | `packages/contracts`（TypeScript 类型 + 错误码 + 树工具） |
| 测试 | Node Test Runner（领域）、Vitest、React Testing Library、Supertest、Playwright |

## 2. 目录

```
apps/api/src/
├── routes/               # 参数校验 + 委托 service
├── services/             # 业务编排；金额计算一律委托领域层
│   ├── ledger.adapter.ts # Prisma BigInt 分 ↔ 领域类型
│   ├── report/           # 四张报表
│   ├── import/ export/   # 备份与 CSV
│   └── investment/       # 资产类型、快照、收益
├── common/               # 错误、HTTP 信封、请求 ID、日期、校验器、日志
└── prisma.ts

apps/web/src/
├── pages/                # 页面（当前 5 个）
├── components/           # 领域组件（common/transactions/budgets/reports/investment/settings/charts）
├── queries/              # React Query hooks + invalidateLedger
├── services/             # api.ts（Axios）、apiError.ts、apiResult.ts
├── hooks/  utils/  styles/  layouts/

packages/
├── domain/src/           # money.ts · date.ts · ledger/{types,postings,summary}.ts
└── contracts/            # types/index.ts（API 类型与错误码）· utils/tree.ts
```

## 3. 领域层规则（最高优先级）

### 3.1 算钱只能有一个实现

```ts
// apps/api/src/services 下的真实导入路径
import { postingsOf, summarizeFlows, remainingRefundable } from '../../../../packages/domain/src/index.js'
```

| 口径 | 落在哪里 |
|---|---|
| 交易 → 分录的方向与金额 | `ledger/rules.vN.ts` 的 `postingsOf`（按交易版本取） |
| 余额（含期初当天计入） | `ledger/postings.ts` 的 `balanceBefore` / `balanceAt` |
| 收支净额与分类汇总 | `ledger/summary.ts` 的 `summarizeFlows` / `flowByCategory` |
| 退款可退余额 | 同上的 `remainingRefundable` |
| 预算的账户/分类/冲减口径 | `ledger/rules.vN.ts` 的 `scopeQuery` / `matchesBudgetScope` |
| 日期格式化（Date → `YYYY-MM-DD`） | `ledger` 之外的 `packages/domain/src/date.ts` 的 `fromDate`（`common/date.ts` 的 `formatDateLocal` 委托给它） |
| 前后端共用的字面量（确认值、备份类型名） | `packages/contracts/constants.ts` |

**统计类接口怎么写**：用 `groupBy` 在 SQL 里按「类型 × 退款原类型 × 不计收支 × 口径版本」
聚合，再把聚合行交给 `summarizeAggregatedFlows` 按各自版本解释。
不要把整表明细读进内存再算——扫描量必须随期间增长，不随总历史增长（见蓝图 D7）。

**`ledger/rules.ts` 是口径的唯一来源**：它同时被领域层的纯函数和后端的 SQL 条件消费，
所以「统计哪些类型」「退款冲减哪一侧」不会各写一份。

**前后端共用的常量放 `packages/contracts/constants.ts`**：像备份类型与显示名这种
两边都要用的字面量，各自写一份必然漂移（曾经后端叫「配置/预算」、前端叫「配置信息/预算配置」）。

**口径带版本（蓝图 A2 已完成）**：

- 交易写入时记录 `ruleVersion`；解释历史数字时按**交易自己的版本**取规则，
  所以改一次口径不会改写历史报表。
- 新增版本：复制 `ledger/rules.v1.ts` 为 `rules.v2.ts`，改行为，
  再 `registerRuleSet(V2_RULES)` 登记。**已登记的版本不允许覆盖**。
- 未知版本直接失败（`rulesFor` 抛错），**不回退到当前规则**——回退等于悄悄改写历史。
- 新交易写入用 `CURRENT_RULE_VERSION`；不要在业务代码里硬编码版本号。

**禁止**在组件、route、service 中复制：

```ts
// ❌ 禁止
if (type === 'refund') amount = +amount
if (type === 'transfer') toAmount = amount - fee
```

> **已知历史例外**：投资分析只统计「转账本金」这一套口径（见 [requirements.md](requirements.md) §3.5），尚未接入领域层规则；
> 收口计划见 [rewrite-blueprint.md](rewrite-blueprint.md) 批次 A0；**新代码不得再加第二份**。

### 3.2 金额

金额的单位是**分**，全链路一套表示（蓝图 A1 已完成）：

| 层 | 形态 |
|---|---|
| 存储 | `BigInt`（分） |
| 契约 / API / 前端 | `Minor`（分） |
| 文件（CSV / 备份） | 元字符串，表头写单位 |

- **算钱只在领域层**，且只用整数分。`Minor` 是 branded number，把元当分传会编译不过。
- **元只出现在两个边界**：用户输入框、文件（CSV / 备份）。别在中间层用元。
- **输入按字符串解析**：`parseAmount('8.11')` → `811`。不要 `Number(x) * 100`
  （`8.115 * 100 = 811.4999…`，浮点会在分位上制造 1 分误差）。最多 2 位小数，超出直接报错。
- **字段名不加单位后缀**：单位由类型保证；**人类读的地方必须写单位**——
  CSV 表头「金额（元）」、备份 manifest、UI 标签、错误信息。
- **服务端是信任边界**：外部金额进来先校验「安全整数 + 范围」，不是整数分就 400，别静默取整。
- **禁止**：领域层出现 `parseFloat`、`toFixed`、`Decimal`；前端用浮点做金额加减。

### 3.3 日期

- 领域层只认 `LocalDate`（`YYYY-MM-DD`）。
- 期间一律半开：`start <= date < endExclusive`。
- 交易日期不存时分秒；`createdAt` 只用于审计。
- 禁止 `new Date('YYYY-MM-DD')`（UTC 偏移）和 `23:59:59.999`。

### 3.4 口径不在本文重复定义

五类交易的 `amount` 含义、期初余额语义、期间边界等**账务口径以 [requirements.md](requirements.md) §3 为唯一来源**。
写代码时如果需要确认某个数字应该等于什么，去查 requirements，不要在这里找第二份定义。

## 4. 命名

| 概念 | 统一用 | 禁止 |
|---|---|---|
| 一笔记录 | `transaction` | `record`, `bill` |
| 分录 | `posting` | `line`, `detail` |
| 账户 | `account` | `wallet`, `card` |
| 分类 | `category` | `class`, `tag` |
| 转账 | `transfer` | `move`, `remit` |
| 退款 | `refund` | `reimburse`, `return` |
| 平账 | `adjustment` | `balanceFix` |
| 预算 | `budget` | `plan`, `envelope` |
| 快照 | `snapshot` | `valuation` |
| 持仓 | `holding` | `position` |
| 期初余额 | `initialBalance` | `openingBalance`（当前实现用 initialBalance） |

- 类型不加 `Data/Info/DTO` 后缀；布尔用 `is/has/can`。
- 缩写只允许 `id`、`db`、`api`、`ui`；禁止 `tx/amt/cat`。
- 中文只出现在文案与注释，标识符全英文。
- **一个概念只能有一个定义**：`TransactionType` 等共享类型只允许在 `packages/contracts` 定义，其余地方引用。

## 5. 文件与导出

- 一个文件一个主要导出，文件名 = 导出名。
- 组件 `PascalCase.tsx`；hook `useX.ts`；其余 `kebab-case.ts`。
- 新组件用 `function Foo(props: FooProps)`，**不用 `React.FC`**；优先 named export。
- 不新增 `index.ts` 桶导出（package 公共入口除外）；已有桶导出逐步清理。
- 弹层属性统一用 `visible`；同一含义的属性名全项目保持一致。
- 注释中文，只写「为什么」，不复述代码。

### 5.1 改动即清理（硬性要求）

**每一次修改或重构结束时，本次改动产生的无用代码与文件必须当场删掉，
不留到「以后再清」——技术债只会滚雪球，等到没人记得它为什么在那儿时，删的成本翻倍。**

| 场景 | 必须做的事 |
|---|---|
| 替换了某个函数/常量/类型 | 删掉旧实现，连带删掉因此变成死代码的辅助函数 |
| 改了 `package.json` 的依赖 | 同步更新 `package-lock.json`；确认无引用后移除依赖 |
| 写了临时脚本/探查脚本 | 用完立刻删，不入库 |
| 同一含义写了两份 | 收敛到唯一来源，其余删除，不留「备用」 |
| 新增导出 | 确认有外部调用方；只有本文件用的降级为文件私有 |

删除前**必须先确认零引用**，不要凭印象删：

```bash
# 按符号找引用（注意项目是 ESM 风格，源码写 ./foo.js、实际文件是 ./foo.ts）
grep -rn "symbolName" apps packages scripts --include="*.ts" --include="*.tsx"

# 按路径过滤输出要用行首锚定：-vE "^path:"，不要 -v "path"（那是按内容过滤）
grep -rn "symbolName" apps packages scripts | grep -vE "^apps/web/src/utils/colorPalette.ts:"
```

排查孤儿文件时注意：ESM 风格下源码导入带 `.js` 后缀，实际文件是 `.ts`，
匹配前要先剥离后缀，否则会把所有文件误报成孤儿。

**改动本身**也要顺手收口：新增功能时若发现别处已经写了一份等价实现
（第二份口径、第二份标签映射、第二份日期格式化），把它一起收敛掉——
这类漂移是「同一个数字两个答案」的来源。

## 6. 类型

- 开启 `strict`；禁止 `as` 断言，允许 `satisfies`。
- 边界处解析（`common/validators.ts` 的校验器），内部信任类型。
- 后端 `tsconfig` 打开 `noUnusedLocals` / `noUnusedParameters`，杜绝死参数（历史 `_fee/_coupon` 就是这么活下来的）。
- API 响应类型统一放 `packages/contracts`，前端只 re-export，不内联 `ApiResponse<{...}>`。

## 7. API 与错误

### 7.1 响应信封

响应是**判别联合**：成功必有 `data`，失败必有 `error`（类型定义在 `packages/contracts/types/index.ts`）。
后端由 `common/http.ts` 的 `success()` / `error()` 统一产出，前端只允许通过 `unwrapApiData` 消费。

错误码只有这几种，前后端共用，禁止自造：

| 错误码 | 含义 |
|---|---|
| `VALIDATION_ERROR` | 参数/业务校验不通过 |
| `NOT_FOUND` | 资源不存在 |
| `DUPLICATE_ERROR` | 唯一约束冲突 |
| `FOREIGN_KEY_ERROR` | 关联数据不存在 |
| `CONFLICT` | 状态冲突 |
| `INTERNAL_ERROR` | 服务端异常 |
| `NETWORK_ERROR` | 前端连不上后端 |
| `UNKNOWN` | 无法归类 |

### 7.2 请求 ID

每个请求由后端分配 ID，并写入请求头、响应头（`x-request-id`）与错误响应体。
**错误体必须带 `requestId`**，前端提示与后端日志用同一个 ID 对照（链路见 [architecture.md](architecture.md) §6）。

### 7.3 前端错误处理

- `apps/web/src/services/apiError.ts`：所有请求失败统一归一化为 `ApiClientError`（`code` / `status` / `details` / `requestId`）。
- `apps/web/src/services/apiResult.ts` 的 `unwrapApiData(res)` 是**唯一**的响应解包入口。
  禁止写 `res.data.data!` 或 `res.data.data ?? []`——那会把接口错误伪装成空数据。
- **接口失败不得退化成 0 或空列表**：失败时用 `ErrorState`（`components/common/ErrorState.tsx`）展示原因与重试入口；
  金额类数据在失败时显示 `—`，不显示 `0`。
- 报表类查询如果保留了上次成功的数据，失败时展示「刷新失败，当前显示上次数据」的提示条而不是清空报表。
- 4xx 不重试；5xx 与网络错误重试一次。切回窗口时刷新已过期数据（`refetchOnWindowFocus: true`）。

### 7.4 路由

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/resources` | 列表 |
| GET | `/api/resources/:id` | 详情 |
| POST | `/api/resources` | 创建 |
| PUT | `/api/resources/:id` | 更新 |
| DELETE | `/api/resources/:id` | 删除 |

- 路由只做参数解析、校验、调用 service；禁止算钱。
- 错误由 `errorHandler` 统一映射；业务错误抛 `AppError` 子类（`code` 必须来自上表）。
- **破坏性接口必须带确认值**：清库等不可逆操作要求请求体带 `confirm`，
  取值来自 `packages/contracts/constants.ts` 的 `CLEAR_CONFIRM`（前后端共用，避免漂移）。

## 8. 数据库

- SQLite，Prisma；金额表示见 §3.2（迁移中），ID 为 `uuid`。
- **改 schema 一律走版本化迁移**：`npm run db:migrate`（生成并应用迁移，SQL 提交进仓库）。
  禁止只用 `prisma db push`——没有迁移历史就无法复现、无法回滚。
  - 迁移名必须以时间戳开头：`YYYYMMDDHHMMSS_描述`（版本新旧按字典序比较）。
  - `npm run db:status` 查看当前库与迁移的差异；`npm run db:deploy` 只应用已有迁移。
  - 测试库由 `tests/global-setup.ts` 用同一套迁移重建（不是 `db push`）。
- `npm run db:drill` 跑恢复演练：导出 → 导入临时库 → 用领域层重算两边余额并对比。
  改动导出/导入/余额逻辑后必须跑一次，结果不一致就是备份不可信了。
- 不持久化余额、预算百分比、快照前链、收益率。
- 交易删除是硬删除；退款通过 `relatedTransactionId` 关联。存在退款的原交易禁止删除，避免孤儿退款。
- CSV 导入用 `Transaction.importKey` 去重；同一文件或数据库已存在的记录会跳过。
- 导入支持 `includes` 范围过滤；覆盖模式只清空所选范围。独立配置覆盖若仍有未纳入范围的交易/预算/快照会被拒绝。
- 覆盖导入必须二次确认；CSV 覆盖在单个事务内先清空再写入。

## 9. 测试要求

顺序：`domain → lint → typecheck → test`。

```bash
npm run test:domain
npm run test:api
npm run test:web
```

新功能必须覆盖：

- 领域：五类交易、退款方向、转账手续费、期初当天、期间边界。
- API：happy path + 关键失败（退款超额、预算边界）。
- 页面：空态、错误态（失败不渲染 0）、移动端布局。

详见 [testing.md](testing.md)。

### 9.1 提交前的自检清单

改动结束、提交之前逐条过：

- [ ] 本次改动产生的无用代码与文件已删（见 §5.1）——被替换的旧实现、临时脚本、冗余依赖、重复实现。
- [ ] 删掉的每个东西都确认过零引用。
- [ ] `npm run typecheck` 0 错误；`npm run lint` 0 错误（warning 可接受，但不要新增）。
- [ ] `npm run test` 全通过。
- [ ] 动了金额/口径/导入导出/余额逻辑 → 额外跑 `npm run db:verify` 与 `npm run db:drill`。
- [ ] 改了 schema → 迁移文件已生成并提交，且 `npm run db:status` 无差异。

## 10. Git 与端口

- 禁止自动 commit/push，除非用户明确要求。
- **一次提交只做一件事**：口径改造（A 批次）与结构改造（D 批次）不得混在同一次提交里。
  提交信息用中文，说明「做了什么 + 为什么」，不写「改了一堆东西」。
- 提交前确认工作区没有残留的临时文件与调试产物。
- 后端 3001，前端 3002（Vite 代理 `/api` → 127.0.0.1:3001）。
- API 默认只监听 `127.0.0.1`；需要局域网访问时显式设置 `HOST=0.0.0.0`，并用 `CORS_ORIGINS` 配置允许来源（逗号分隔）。
