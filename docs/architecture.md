# MoneyBrain 架构（当前实现）

> 本文回答**现在代码是怎么组织的**。待办与目标态见 [roadmap.md](roadmap.md)，编码约定见 [dev-guide.md](dev-guide.md)，账务口径见 [requirements.md](requirements.md)。
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
apps/api  →  packages/contracts, packages/domain, packages/sync
packages/sync → 无外部依赖（记录级合并，不依赖文件系统 / 网盘 SDK）
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

设计不变量（12 条）的定义见 [requirements.md](requirements.md) §3.8，测试覆盖见 [testing.md](testing.md) §5.1 / §5.3。

> 领域层与后端之间的适配在 `apps/api/src/services/ledger.adapter.ts`（Prisma `BigInt` 分 ↔ 领域类型）。

## 2.5 共享契约层（packages/contracts）

前后端都要用、且**必须一致**的东西放这里。任何一方各写一份的常量都会随两边演化悄悄漂移。

| 位置 | 职责 |
|---|---|
| `types/index.ts` | 共享 DTO 类型（报表结构、实体、导入导出结果） |
| `constants.ts` | 跨端字面量：`CLEAR_CONFIRM`（破坏性操作的确认值）、`BACKUP_DATA_TYPES`（备份类型） |
| `utils/tree.ts` | 分类树构建（后端 `common/tree.ts` 转出，前端共用） |

前端通过 `@contracts/*` 别名引用（`tsconfig.json` 与 `vite.config.ts` 都配了），
后端用相对路径（与 domain 一样，避免开发期额外构建步骤）。

日期格式化由 `common/date.ts` 委托给领域层的 `fromDate`，全库只有一套实现。

## 2.6 同步层（packages/sync）

记录级合并的唯一实现，与端无关：不读文件、不碰网盘 SDK、不认识具体实体类型。

| 位置 | 职责 |
|---|---|
| `version-vector.ts` | 版本向量编解码与比较（`compareVersionVectors` / `maxVersionVectors`），不用设备时钟判先后 |
| `merge.ts` / `records.ts` | `mergeRecord` / `mergeRecords`：稳定全序选出生效版本，输的一版作为冲突返回；结果与到达顺序无关且可重复应用 |
| `references.ts` | 合并后的引用校验：悬空引用进入待补全，补齐后转正常；墓碑引用不静默复活 |
| `canonical.ts` | 内容指纹与稳定序列化（固定向量测试的基准） |
| `apply.ts` | 合并结果落库：按记录 `entityType` 分发，未知实体跳过 |
| `local-fields.ts` | 本机字段（`ledgerId` / `deviceId` 等）不随记录同步 |
| `container.ts` | 加密容器（`.mbx`）：Argon2id 派生密钥 + XChaCha20-Poly1305，备份/同步共用；AAD 绑定 `formatVersion|ledgerId`；格式见 [sync-container-format.md](sync-container-format.md) |
| `test-vectors/merge-vectors.json` | 跨端共用的合并固定向量 |

`apps/api` 侧：六类可同步实体（账户分类、账户、收支分类、交易、预算、投资快照）各带
`rev` / `vv`；`db/sync-identity.ts` 在数据库同目录的 `sync-identity.json` 持久化
`ledgerId` / `deviceId`（容器 AAD 用 `formatVersion|ledgerId`）；`db/sync-version.ts`
在写入时递增 `rev` 并刷新 `vv`；输的一版落 `sync_conflicts` 表。

**未落地**：传输适配、同步端点与跨设备搬运，见 [roadmap.md](roadmap.md) §3 的 G 批。

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
| `services/ledger.adapter.ts` | Prisma `BigInt` 分 ↔ 领域类型适配 |
| `common/` | 错误、HTTP 信封、请求 ID、日期、校验器、日志、树工具 |

## 4. 前端数据流（apps/web/src）

```
features/<domain>/Page → api<Domain>.ts（或 LedgerContext）
                         → services/api.ts → Axios → Express
                         ← ApiResponse<T>（判别联合，apiResult.unwrapApiData 解包）
```

| 位置 | 职责 |
|---|---|
| `app/design/DesignApp.tsx` | 唯一页面装配：路由（`/design` 与 `*` 均渲染它）、设备判定、全局 Provider |
| `features/overview/` | 总览、快速记账、`LedgerContext` / `apiLedger.ts`（共享账本状态与写操作） |
| `features/transactions/` | 流水、详情、批量、回收站；`apiTransactions.ts` |
| `features/reports/` | 四张报表、图表、下钻；`apiReports.ts`；`reportRows.ts` 的 `flattenTreeRows` / `flattenTreeCards` 是分类树到表格 / 卡片的唯一展开实现；左右双表统一由 `ReportTable.tsx` 的 `ReportTablePair` 补齐行数并对齐合计行 |
| `features/budgets/` | 预算列表/编辑、状态、推演；`budgetModel.ts` |
| `features/ledger-config/` | 账户分组 / 收支分类 / 现金流分类的共享配置抽屉与 controller（设置页与报表页同源）；`drag.ts` 提供仅竖直方向的拖拽 modifier 与行样式 |
| `features/settings/` | 8 分区设置、导入导出、自动备份、回收站 |
| `features/shell/` | 桌面侧栏 / 移动底栏与浮层宿主 |
| `features/shared/` | HfButton、HfSheet、HfSegmented、HfSwitch、HfTabs、HfHeadAction、Card、toast、StateViews、chartLayout、datePicker；`foldState.ts` 是全仓折叠列表的唯一默认口径（默认收起） |
| `services/api.ts` | Axios 实例 + 响应拦截器（统一归一化错误） |
| `services/apiError.ts` / `apiResult.ts` | `ApiClientError`；`unwrapApiData(res)` 是唯一解包入口 |

**报表展示口径固定**：`reportSettings.ts` 只持久化「含不计收支交易」数据范围，不再保存分组方式 / 列集合 / 比例 / 排序等展示配置。报表页点「设置」直接打开 `ledger-config/LedgerConfigManager` 的单一分区（由 `ReportsPage` 的 `REPORT_CONFIG` 固定 tab 与标题），没有中间层弹窗，也不带跨分区页签；收支明细的数据范围开关作为 `extra` 与分类管理同处一层。

资产负债表的「账户分类 → 账户」层级由 `reportsModel.ts` 的 `buildBalanceGroups` 派生（缺分类元数据时按后端节点名兜底）：账户按自己的 `categoryId` 成组，**不做子分类向父分类归一**——设置页把每个账户分类平铺成分组，报表同口径，否则父级「资产」下的「现金 / 投资」会并成一组。`buildBalanceTrees` 再转成四张报表共用的 `FlowTreeNode`：表格、移动卡片与资产 / 负债构成环都消费这一份树。构成环与收支构成共用 `charts.tsx` 的 `DonutCompare`（一个 `ChartCard` 内左右两环同尺寸），`BalanceComposition` 与 `CompositionBars` 只是两侧配置不同。四个视图共用 `foldState` 决定展开状态（默认收起）。

**顺序与对齐**：后端按 `sort` 返回分类 / 账户，映射层（`apiReports.ts`）、分组层（`reportsModel.ts`）与投资持仓层都不再按金额重排，设置里的拖拽顺序即报表默认顺序。左右双表用固定数据行高 + 固定表头最小高度 + `ReportTablePair` 补齐行数，保证合计行同 y。

**缓存失效**：派生数据来自同一份交易；写操作后由 `DesignApp` 集中失效 `['hf', …]` 领域键，
不在各页面散写。`queries/` 目录已不存在；不要重新引入。

**错误处理**：拦截器把任何失败归一化为 `ApiClientError`；页面用 `features/shared/StateViews.tsx`
的 `ErrorPanel` 展示原因与重试，金额失败显示 `—` 而不是 `0`。

## 5. 数据库模型

Prisma + SQLite，`apps/api/prisma/schema.prisma`。金额字段为 `BigInt`（整数分），ID 为 `uuid`。

**schema 演进走版本化迁移**（`apps/api/prisma/migrations/`）：改 schema 执行 `npm run db:migrate`，
生成的 SQL 提交进仓库；`npm run db:status` 查看当前库与迁移的差异。
测试库在系统临时目录按运行唯一创建：`tests/global-setup.ts` 用同一套迁移重建模板，各测试文件复制独占副本，跑完删除。

备份文件带 `schemaVersion`（导出时最新一条已应用的迁移名）：比当前应用新的备份会被拒绝导入，
更旧的在兼容模式下导入并记一条警告。

| 模型 | 说明 |
|---|---|
| `AccountCategory` | 账户分类（资产/负债），树形；`isCashEquivalent`、`isInvestment` |
| `Account` | 账户；`initialBalance` + `initialBalanceDate` 即期初余额 |
| `TransactionCategory` | 收支分类（收入/支出），树形；`cashFlowType` 决定现金流量表归类 |
| `Transaction` | 交易；`type` 五选一；`fee`/`coupon` 独立；`importKey` 唯一用于导入幂等；`relatedTransactionId` 关联退款；`excludeFromIncomeExpense` 表示不计收支；`ruleVersion` 记录写入时的口径版本 |
| `Budget` | 预算；账户 + 分类 + 周期 + 额度 |
| `InvestmentAssetClass` | 投资资产类型与目标比例 |
| `InvestmentAllocationSnapshot` | 投资快照；`previousSnapshotId` 为派生链，写入后重排 |
| `InvestmentAllocationItem` | 快照内的持仓市值与期间净流入 |
| `SyncConflict` | 合并冲突留存（`sync_conflicts`）：生效版本与输的一版各存整条 JSON，`resolvedAt` 标记是否待处理；不进容器、不参与同步 |

六类可同步实体（`AccountCategory` / `Account` / `TransactionCategory` / `Transaction` / `Budget` / `InvestmentAllocationSnapshot`）各带 `rev`（本设备修订号）与 `vv`（版本向量 JSON）；`ledgerId` / `deviceId` 不落库，存在数据库同目录的 `sync-identity.json`（见 §2.6）。

数据库不存派生值：余额、预算百分比、收益率按需计算。快照链是显式例外——`previousSnapshotId` 入库并在写入后重排，供「按期间取前链」用。

**口径版本**：`Transaction.ruleVersion` 是写入这笔交易时的账务口径版本。
解释历史数字时按交易自己的版本取规则（`rulesFor(version)`），
因此新增口径版本只影响新写入的交易，旧交易的余额与报表数字不变。
未知版本直接失败，不回退到当前规则——回退等于悄悄改写历史。

**金额表示**：金额列是 `BigInt`（整数分），契约与前端用 `Minor`（branded number），
`ledger.adapter.ts` 负责 `BigInt ↔ Minor`。元只出现在用户输入框与文件（CSV / 备份）两个边界。

**CSV 往返**：导出带「口径版本」列；导入读该列，旧 CSV 缺省为当前版本。

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

## 7. 对账与自检

本文不维护技术债清单，只记录跨模块的现状事实；待办见 [roadmap.md](roadmap.md) §3 与 §7。

- 收入支出表 API 返回 `reconciliation`（期初 + 净收入 − 净支出 + 其他 = 期末，差额应为 0）；
  前端不常驻对账条，差异以角标说明（[ui-design.md](ui-design.md) §3.2）。
- `npm run db:verify` 用同一套规则离线复核整本账；`npm run db:drill` 验证备份能还原出同样的余额。

## 8. 端口与运行

- 后端 `3001`，前端 `3002`（Vite 代理 `/api` → `127.0.0.1:3001`）；生产预览 `vite preview` 用 `4173`。
- API 默认只监听 `127.0.0.1`；需要局域网访问时显式设置 `HOST=0.0.0.0`，并用 `CORS_ORIGINS` 配置允许来源（逗号分隔）。
- 根目录 `npm run build` 由 `scripts/build.mjs` 串行构建；在 Windows 上把 `TEMP`/`TMP` 指向仓库内临时目录，避开 esbuild 清理系统临时目录的权限问题。

## 9. 桌面端（Electron）

`apps/desktop/` 是唯一的桌面打包链路，与 `apps/api` / `apps/web` 解耦、不参与 `npm run dev`：

| 位置 | 职责 |
|---|---|
| `src/main.cjs` | `BrowserWindow` 主进程；空闲随机端口 + `ELECTRON_RUN_AS_NODE` 子进程启动 API；`WEB_DIST` 让 API 同端口托管前端产物；`requestSingleInstanceLock()` 保证单实例；`before-quit` 停 API |
| `electron-builder.yml` | `nsis` 安装包 + `portable` 免安装目录；配置卸载不删账本 |
| `scripts/stage-app.mjs` / `after-pack.cjs` | 暂存应用目录 / 打包后补齐运行所需文件 |

- 账本固定在 `app.getPath('userData')/data/moneybrain.db`，启动时执行 `prisma migrate deploy` 幂等迁移；**不读取仓库里的 `apps/api/prisma/dev.db`**。
- 未知 `/api/*` 路径仍由 `apps/api/src/index.ts` 的 `notFoundHandler` 返回 JSON 信封，不返回 HTML。
- 旧 `scripts/desktop.mjs`（Edge `--app`、固定 3001/4173、9333 调试端口与临时 profile 锁）只作开发态快捷入口，与 Electron 链路并存但不是一个东西。
- 代码签名、自动更新、安装包真机分发验收未做，见 [roadmap.md](roadmap.md) §7。
