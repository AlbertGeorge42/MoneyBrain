# HF 高保真接入方案（2026-11-06）

> 范围：当前 HEAD `f367664` 的 `/design` 高保真（下称 HF）能否切到生产路由，以及分页接入顺序。
> 前七节为接入前的只读审计（保留原文，代码行号可能随重构漂移）；第八节为 2026-11-06 的实际接入进度。
> 所有证据按「文件:行」标注，`file:///` 链接可直接跳转。

## 结论

**现在不能整体切换。** `/design` 的五个页面全部跑在内存种子账本上，没有一条 API 读写；
切换不是「换视图」，而是「换数据源 + 换路由」。建议分页接入，先总览（只读），不整体替换。

> 2026-11-06 更新：**总览已按此建议完成只读接入，流水已完成真实读写**（开关 `VITE_HF_DATA=api`，默认仍为种子）。
> 其余三页未接；进度与回退见第八节。

## 一、事实核实

### 1. HF 页面的数据来源

- HF 入口只挂 `/design`，与生产路由并列，不互相引用：[App.tsx L11](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/App.tsx#L11)、[L19-L25](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/App.tsx#L19-L25)；生产路由仍是旧 AntD 页：[App.tsx L26-L32](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/App.tsx#L26-L32)。
- HF 数据全部来自 `createSeedLedger()` 的内存 state：`useState<Ledger>(() => initialLedger ?? createSeedLedger())`（[LedgerContext.tsx L23](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/overview/LedgerContext.tsx#L23)），增删改只是 `setLedger`（[L25-L51](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/overview/LedgerContext.tsx#L25-L51)）。
- `LedgerContextValue` 没有任何持久化或请求字段，只有内存操作（[ledgerStore.ts L5-L18](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/overview/ledgerStore.ts#L5-L18)）。
- 代码事实：`git grep -e 'queries/' -e 'services/api' apps/web/src/app/design apps/web/src/features` → **0 命中**；HF 不读 `apps/api`，也不读 `packages/domain|sync`。
- 两条路径互不分支：`/design` = 内存 HF；`/` 下旧页 = React Query 真实 API（[main.tsx L59](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/main.tsx#L59)）。**切换点只有一个：`App.tsx` 的路由 + 更换 Provider**（把 `LedgerProvider` 从 `initialLedger` 改成「API → Ledger 适配层」）。

### 2. 已接入程度（真实读写）

| 页面 | 读 | 写 | 判定 |
|---|---|---|---|
| 总览 | 种子账本 | 无 | 未接 |
| 流水 | 种子账本 | 本地增删改、本地 6 秒撤销 | 未接 |
| 报表 | 种子账本派生 | 无 | 未接 |
| 预算 | 种子账本派生 | 本地改限额/删除 | 未接 |
| 设置 | 种子账本 | 本地增删账户/分类、导入导出、回滚、清空 | 未接 |
| 记账浮层 | 种子账本 | 本地新增 | 未接 |

全部写入都落在 `LedgerProvider` 内存，刷新即回到种子；「保存/撤销/筛选/下钻」在页面上可操作，但**没有一条请求发给 `/api`**。

### 3. 切换机制现状

- 生产由 `src/pages` + `MainLayout` 承接（[App.tsx L26-L32](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/App.tsx#L26-L32)）。
- HF 已有入口但只在 `/design`（[L19-L25](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/App.tsx#L19-L25)）。
- **没有** feature flag、环境变量或路由前缀；当前无法灰度，也没有 `/legacy`。

### 4. 共用层

- 旧页用 React Query（`src/queries/*` + `src/services/api.ts`）；HF 完全不 import 这些（见事实 1 的 grep）。
- 两端共享只有：全局 `QueryClientProvider`（HF 未使用）、`/styles` 少量 token、`features/shared` 自有组件。
- 因此切换到生产是**换数据源 + 换视图**，不是「换视图」；只有 DTO → `Ledger` 模型适配层可以复用。

### 5. 冻结层依赖

- `git grep -e "from '.*(pages|components|layouts)/" apps/web/src/app/design apps/web/src/features` → **0 命中**。
- HF 不依赖旧页、旧布局、旧通用组件；按页删除旧前端在依赖层面可行，但旧页与后端共用的 `services/api.ts`、`queries/*` 必须保留（HF 接线要复用）。
- 旧页仍是唯一真实数据前端，删除必须等对应 HF 页完成接线并验收（见 [PROGRESS L91](file:///c:/Users/George/Documents/MoneyBrain/docs/blueprint/PROGRESS.md#L91)）。

## 二、硬缺口

### 已确认（用户提出的 3 条全部属实）

1. **预算「本月可花」混算周期 + 账户绑定漏计**
   - 头部合计把所有支出预算行的 `used`/`limit` 直接相加，不区分 `period`：`expenseRows.reduce(...)`（[budgetModel.ts L237-L239](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/budgets/budgetModel.ts#L237-L239)）。周/年预算被并入月度，¥2,632.80 vs ¥737.80 的差异来源。
   - 只统计绑定账户：`if (budget.accountId && transaction.accountId !== budget.accountId) return false`（[L198](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/budgets/budgetModel.ts#L198)），其他账户的同类支出不计入。
2. **报表设置四个「配置」是占位 toast**：[ReportsPage.tsx L342](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/ReportsPage.tsx#L342) —— `notify(\`${item.label}配置将在设置批次接入\`)`。
3. **回收站恒空、6 秒后不可恢复**：
   - 页面写死「回收站是空的」「0 条可恢复」：[SettingsPage.tsx L1339-L1340](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/settings/SettingsPage.tsx#L1339-L1340)、[L1374](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/settings/SettingsPage.tsx#L1374)。
   - 删除只从内存账本移除（[ledgerOps.ts L43-L45](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/transactions/ledgerOps.ts#L43-L45)），6 秒撤销是内存快照，过期即无法找回。
   - 后端其实已具备软删除 + 回收站 + 审计撤销（[transaction.route.ts L176-L179](file:///c:/Users/George/Documents/MoneyBrain/apps/api/src/routes/transaction.route.ts#L176-L179)、[L480-L493 软删](file:///c:/Users/George/Documents/MoneyBrain/apps/api/src/services/transaction.service.ts#L480-L493)、[audit-event.route.ts L10](file:///c:/Users/George/Documents/MoneyBrain/apps/api/src/routes/audit-event.route.ts#L10)）；缺口在 HF 没接，不是后端没有。

### 新发现的功能级缺口

4. **设置的数据操作全是本地模拟**：导入/导出/回滚/清空只对内存账本生效（`replaceLedger`，[SettingsPage.tsx L697-L702](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/settings/SettingsPage.tsx#L697-L702)、回滚 [L1295-L1310](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/settings/SettingsPage.tsx#L1295-L1310)、清空 [L1318-L1330](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/settings/SettingsPage.tsx#L1318-L1330)）。后端对应端点是齐的：[data.route.ts L87/L124/L202/L241](file:///c:/Users/George/Documents/MoneyBrain/apps/api/src/routes/data.route.ts#L87)。
5. **没有同步开关/状态**：`grep '同步' SettingsPage.tsx` → 0 命中；同步能力只在 `packages/sync`，前端无入口，谈不上「可关闭」。
6. **HF 无任何持久化**：全内存 state，没有 localStorage，刷新即回种子；接线前不能切任何一页。
7. **报表四视图口径未对后端**：现金流/投资分析在 HF 由本地账本派生（[ReportsPage.tsx L53-L54](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/ReportsPage.tsx#L53-L54)），后端四视图端点已存在（[report.route.ts L7-L25](file:///c:/Users/George/Documents/MoneyBrain/apps/api/src/routes/report.route.ts#L7-L25)），接入时须改为端点口径，不能沿用本地算法。

## 三、接入顺序（建议）

**总览 → 流水 → 报表 → 预算 → 设置**（记账浮层随总览/流水一起接）。

理由：
1. **先只读后写入**：总览/报表只读，出错不产生脏数据；流水/预算写；设置是破坏性操作，必须最后。
2. **总览风险最低**：只依赖 `dashboard`、`trends`、`accounts` 三类只读端点（[analytics.route.ts L7-L27](file:///c:/Users/George/Documents/MoneyBrain/apps/api/src/routes/analytics.route.ts#L7-L27)），且 HF 的三态（加载/空/错）已有壳，接真实状态成本最小。
3. **流水依赖撤销语义**：真实删除是软删 + 审计事件，6 秒撤销要改成 `POST /audit-events/:id/undo`，并让过期删除出现在回收站；这条链路先通，预算/设置才有可信的写基础。
4. **报表依赖流水筛选**：下钻落到流水页要带真实 `filters`，顺序上放在流水之后。
5. **预算有两个硬缺口**（周期混算、账户绑定），必须在接线时同时定口径，不能先切后修。
6. **设置最后**：导入/回滚/清空/回收站会改整库，放在其他页稳定后再切。

## 四、每页前置条件

| 页面 | 前置条件 |
|---|---|
| 全局（第 0 步） | 新建 `Ledger` ↔ API DTO 适配层；`DesignApp` 支持「内存演示 / API」两种数据源；加路由级开关（如 `VITE_HF_PAGES=overview`），默认全关；三态由真实请求驱动 |
| 总览 | `GET /analytics/dashboard`、`/trends`、`/category-breakdown`、`/asset-trend`、`GET /accounts`；空账本与错误态真实可复现；PC/移动两档验收 |
| 流水 | `GET /transactions`（筛选/分页参数对齐）、`POST/PUT/DELETE /transactions`、`POST /audit-events/:id/undo`、`GET /transactions/recycle-bin`、批量删除；6 秒撤销改真实撤销，过期进回收站；分类/账户下拉走真实数据 |
| 报表 | `GET /reports/balance-sheet`、`/income-expense`、`/cash-flow`、`/investment-analysis`；时点/期间口径；下钻深链带流水筛选参数；配置入口接真实设置或明确隐藏 |
| 预算 | `GET /budgets/statuses`、`GET /budgets`、`POST/PUT/DELETE /budgets`；修复头部合计只取月度、明确账户绑定语义（按分类全账户 or 按账户）；超支/接近/达成三态用后端口径复核 |
| 设置 | `GET/POST/PUT/DELETE /accounts`、`/account-categories`、`/transaction-categories`；`/data/export`、`/data/import-backup`、`/data/rollback-points`、`/data/all`；`/transactions/recycle-bin` + 撤销；破坏性操作二次确认与失败回显 |
| 记账浮层 | 随流水一起：`POST /transactions`、快捷键/触屏验收；金额校验错误态 |

## 五、回退路径

- **路由级开关**：每个页面接入时只开对应 flag，出问题关 flag 即回旧页，无需回滚数据。
- **按页提交 + `git revert`**：每页独立提交，回退单位与 [PROGRESS L91](file:///c:/Users/George/Documents/MoneyBrain/docs/blueprint/PROGRESS.md#L91) 一致；不保留 `/old` 路由或开关。
- 旧页在对应 HF 页验收通过后**同一提交**删除，删除后回退靠 git revert。
- 数据回滚与前端回退分离：设置里的「回滚存点」只作用于数据，不改变版本。

## 六、一次性替换 vs 分页替换

| | 一次性替换 | 分页替换 |
|---|---|---|
| 人力 | 一次做 5 页 + 设置破坏性操作 + 预算口径修复 | 先做适配层，再每页 1 个切片 |
| 回归面 | 全站（总览/流水/报表/预算/设置/桌面） | 单页 + 相邻页（下钻入口） |
| 可定位性 | 出问题难判断是数据层还是视图 | 适配层与页面分别验证，问题边界清楚 |
| 回退 | 只能整批回退 | 开关/单页 revert |
| 风险 | 预算与回收站缺口会同时暴露在生产 | 缺口按页暴露，可先修后切 |
| 旧页处置 | 一次性删，失去真实数据对照 | 每页验收后删，其余仍可对照 |

结论：分页替换总工时略多，但回归面和回退成本明显更低，推荐分页。

## 七、现在就能切的页面

**总览已具备只读切换条件，流水已具备读写 + 撤销 + 回收站的切换条件**（2026-11-06 完成，见第八节）；其余三页仍依赖内存数据，直接切会把演示数据当生产数据。
报表需先接四视图端点；预算需先修口径；设置必须最后。

## 八、接入进度（2026-11-06）

| 顺序 | 页面 | 状态 | 数据来源 | 回退 |
|---|---|---|---|---|
| 1 | 总览 | **已接（只读）** | `dashboard`、`asset-trend`、`accounts` + `balance-at`、`budgets` + `statuses`；DTO→`Ledger` 适配层 | `VITE_HF_DATA` 默认 `seed`，启动时不设即回种子；页面代码不动 |
| 2 | 流水 | **已接（读写 + 审计撤销 + 回收站）** | `GET /transactions`（含 `keyword/amountMin/amountMax`）、`POST/PUT/DELETE /transactions`、`POST /audit-events/:id/undo`、`GET /transactions/recycle-bin`；DTO→`LedgerTransaction` 与分类展示映射 | `VITE_HF_DATA` 默认 `seed`；API 模式写操作真写库，种子模式仍内存 |
| 3 | 报表 | 未接 | 计划：四视图端点，下钻带流水筛选 | 同上 |
| 4 | 预算 | 未接 | 计划：`budgets` + `statuses`，先定月度口径 | 同上 |
| 5 | 设置 | 未接 | 计划：账户/分类 CRUD、导入导出、回滚、清空、回收站 | 同上 |

总览接入要点：

- 开关：`VITE_HF_DATA=api` 读真实账本；不设或设为其它值保持种子。**没有新增 `/old` 路由，也不改旧前端。**
- 三种状态由真实请求驱动：加载中显示骨架、无账户显示冷启动、请求失败显示错误与重试；API 模式加载中用空账本占位，**不用种子兜底**。
- 总览本身只读；「记一笔」浮层随流水批次已接真实 `POST /transactions`，API 模式写操作不再被拒绝。
- 新增端点：**0**。账户余额使用现有 `GET /accounts/:id/balance-at`，逐个账户取（N+1）。
- 已知未改口径：总览预算卡仍把所有周期预算相加（见 [hf-api-gaps.md](hf-api-gaps.md)），留给预算批次。

流水接入要点：

- 读：`GET /transactions` 承担分页与全部筛选（期间/分类/关键词/类型/账户），`categoryIds` 映射为重复 `categoryId`；前端不再本地过滤一遍。无可见分页控件，按 `pageSize=100` 自动翻到 `total`（请求数 = `ceil(total/100)`）。
- 写：新增/编辑/删除真实 mutation；失败保留输入或表单并回显错误、可重试，成功后才关闭弹层或刷新列表。
- 删除 / 撤销：逐条 `DELETE` 收集 `auditEventId`，6 秒 toast「撤销」走 `POST /audit-events/:id/undo` 并刷新三组查询；过期记录留在 `GET /transactions/recycle-bin`。
- 回收站：设置页 API 模式显示真实条目、数量与恢复（`deleteEventId`）；种子模式保持原空态，视觉不变。
- 批量：改分类与删除都是逐条请求（请求数 = 选中笔数），非原子；部分失败保留失败项供重试。
- 新增端点：**0**；`GET /transactions` 新增参数 `keyword`、`amountMin`、`amountMax`（整数分）。
- 遗留：退款关联原交易、`PUT` 的 6 秒撤销（后端不返回审计 id）、流水页独立回收站入口。

下一批：**报表**。前置条件见 [hf-api-gaps.md](hf-api-gaps.md) 的「下一批：报表」。
