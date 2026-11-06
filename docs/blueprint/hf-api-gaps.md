# HF × API 缺失清单（2026-11-06）

> 对照 `apps/api` 路由与 `packages/contracts/types`，逐页列出「接口有什么 / 前端缺什么 / 接上要改哪一层」。
> 状态基准：总览（只读）、流水（读写、审计撤销、回收站）、设置（账户/分类读写、排序、撤销、回收站、导入/导出/导入回滚/清空）已接真实账本（`VITE_HF_DATA=api`）；报表、预算仍在内存种子账本上。
> 阻塞级别：**A = 会挡住接入**；**B = 只是体验缺失**；**C = 已知占位 / 未到里程碑**。

## 结论先行

- **本批新增端点：2 个**（`GET /data/import-batches`、`POST /data/import-batches/:id/rollback`）。此前设置批新增 0 个，只扩展现有端点：`POST /accounts` 接受 `sort`；`DELETE /accounts/:id`、`DELETE /transaction-categories/:id` 返回 `auditEventId`；`GET /transactions/recycle-bin` 响应追加 `accounts` / `categories`。
- 总览已只读接通；流水已接通读、写、审计撤销与回收站；设置已接通账户与分类的读写、排序/移动、删除撤销、回收站，以及导入/导出/导入回滚/清空。API 模式写操作真写库，种子模式仍走内存。
- 接口侧真正缺的只有一件：**没有同步端点**（同步能力还在 `packages/sync`，未到里程碑，不阻塞当前接入）。
- 报表四视图接口已有；缺的是前端接线，不是后端能力。
- 下一批建议做**报表**：它的下钻落到流水页，依赖流水批次已接通的真实筛选参数。

## 缺失清单

| 页 | 能力 | 接口现状 | 前端现状 | 缺什么 | 阻塞级别 |
|---|---|---|---|---|---|
| 总览 | 净资产 / 本月收支 / 最近流水 | `GET /analytics/dashboard`（本月/上月 + recentTransactions）、`GET /accounts` | 已接：dashboard 直接提供收支与最近流水 | 无 | 已接入 |
| 总览 | 净资产走势 | `GET /analytics/asset-trend`（12 个月） | 已接：走势取真实 12 个月，末点随净资产联动 | 无 | 已接入 |
| 总览 | 预算卡 | `GET /budgets` + `GET /budgets/statuses` | 已接：已用金额用后端 statuses | 头部合计仍混算周期（见预算页）；本批未改口径 | B |
| 总览 | 账户余额 | `GET /accounts/:id/balance-at?date=`（单账户） | 已接：`Promise.all` 逐账户取 | 无批量余额端点；账户多时请求数线性增长 | B |
| 流水 | 列表 / 分页 / 筛选 | `GET /transactions`：`page/pageSize/accountId/categoryId[]/type[]/startDate/endDate/keyword/amountMin/amountMax` | 已接：`categoryIds` → 重复 `categoryId`；期间/分类/关键词/类型/账户全部交服务端，前端不再本地过滤；无可见分页控件，按 100/页自动翻到全量；关键词只搜备注/账户/分类/方向，**不搜金额文本**（与种子版一致，金额用区间筛选） | 无 | 已接入 |
| 流水 | 新增 / 编辑 | `POST /transactions`、`PUT /transactions/:id` | 已接：真实 mutation；失败保留输入或表单并回显，可重试；成功后失效总览/流水/回收站查询 | `PUT` 不返回 auditEventId，API 模式编辑没有 6 秒撤销 | 已接入（撤销缺口 B） |
| 流水 | 删除 + 6 秒撤销 | `DELETE /transactions/:id` 返回 `auditEventId`；`POST /audit-events/:id/undo` | 已接：逐条软删收集 `auditEventId`，6 秒 toast 撤销走审计事件；过期记录留在回收站 | 批量删除是逐条 N 次请求，非原子 | 已接入 |
| 流水 | 回收站 | `GET /transactions/recycle-bin`（`RecycleBinItem.deleteEventId`） | 已接：设置页 API 模式显示真实条目、数量与恢复（复用 audit undo）；种子模式保持原空态 | 流水页暂无独立入口（入口在设置页） | 已接入（入口 B） |
| 流水 | 批量改分类 | 无批量端点；只能逐条 `PUT /transactions/:id` | 已接：逐条 PUT，请求数 = 选中笔数；部分失败保留失败项可重试 | 非原子；无 6 秒撤销（update 无 auditEventId） | B |
| 流水 | 退款 / 关联原交易 | `POST` 支持 `relatedTransactionId`；`GET /transactions/refundable` | 无退款关联能力；API 模式显式返回「本批暂未接入」，不假装成功 | 编辑器补关联选择与可退列表 | B（留到下一批） |
| 报表 | 资产负债表 | `GET /reports/balance-sheet?date=`（时点语义） | 本地 derive 四视图之一 | 改为端点口径；保留时点控件 | A |
| 报表 | 收支明细 | `GET /reports/income-expense?from&to` | 本地 derive | 改为端点口径 | A |
| 报表 | 现金流量表 | `GET /reports/cash-flow?from&to` | 本地 derive | 改为端点口径（现金流分类以后端 `cashFlowType` 为准） | A |
| 报表 | 投资分析 | `GET /reports/investment-analysis?from&to` | 本地 derive | 改为端点口径 | A |
| 报表 | 四个「配置」按钮 | 无对应端点（属于展示设置，不是数据接口） | 占位 toast | 明确隐藏，或落到页面级展示设置并持久化到本地；不需要新端点 | C |
| 报表 | 下钻到流水 | `GET /transactions` 支持多 `categoryId` | 只写 URL 的 `categoryIds` | 下钻时把 `categoryIds` 映射成重复 `categoryId`，并带 `from/to` | B |
| 预算 | 预算 CRUD | `GET/POST/PUT/DELETE /budgets` | 本地改限额/删除 | 真实 CRUD + 失效查询 | A |
| 预算 | 已用 / 超支判定 | `GET /budgets/statuses`（按周期、按 `accountId` 绑定） | 本地重算 | 改为 statuses；账户绑定语义必须与产品确认 | A |
| 预算 | 本月可花 | 无月度聚合端点；只有逐预算 `remaining` | 头部把周/年预算并入月度并相加（[budgetModel.ts L241-L243](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/budgets/budgetModel.ts#L241-L243)） | 前端先只取月度预算再加总；若要「跨账户可花」还需后端聚合口径 | A |
| 预算 | 账户绑定漏计 | statuses 明确按 `accountId` 过滤 | 同类支出在别的账户不计入（[budgetModel.ts L201](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/budgets/budgetModel.ts#L201)） | 产品先定：按分类全账户，还是按账户；不然后端 statuses 也只是「正确地」漏计 | A |
| 预算 | 预测 | `GET /budgets/predictions` | 未用 | 接线后可作为体验增强 | B |
| 预算 | 用量明细 | `GET /budgets/:id/usage-details` | 未用 | 接线后补下钻 | B |
| 设置 | 账户 CRUD / 排序 | `GET/POST/PUT/DELETE /accounts`、`PUT /accounts/sort/batch` | 已接（API 模式）：创建/编辑/删除真写；余额按差额修正 `initialBalance`，与 `balance-at` 同口径；排序落 `PUT /accounts/sort/batch` | 删除有引用时后端拒绝，前端原样提示原因 | 已接入 |
| 设置 | 账户性质 | 无独立端点；由顶级账户分类标记（现金等价 / 投资 / 负债）表达 | 已接：四类性质映射到顶级账户分类 | 无 | 已接入 |
| 设置 | 交易分类父子结构 | `/transaction-categories` 含 `parentId`、`move`、`sort` | 已接（API 模式）：两级增删改、`move`、排序真写；展示 id ↔ 真实 id 经 `categoryDisplay/categoryReal` 映射 | 无 | 已接入 |
| 设置 | 合并集合（「其余 N 类」） | 无「合并分类」实体端点；流水筛选支持多 `categoryId` | 报表用本地 `mergedIds` | 不需要新端点，接线时把集合映射成重复 `categoryId` | B |
| 设置 | 导入 | `POST /data/import-preview`、`/data/import-backup`、`GET /data/import-batches` | 已接（API 模式）：先预览（期间跨度/笔数/金额合计/未知账户分类/疑似重复）再写库；写入返回 `importId`，批次列表显示本批笔数 | 无 | 已接入 |
| 设置 | 导出 | `GET /data/export-full`（`.mbx`，文件名带日期） | 已接（API 模式）：下载真实 `.mbx`；导出成功才解锁清空 | 无 | 已接入 |
| 设置 | 导入回滚 | `POST /data/import-batches/:id/rollback`（需 `confirm=rollback-import`） | 已接（API 模式）：批次两击确认，按 `importId` 只删本批新建行，回显实际撤销笔数 | 存点回滚（`/data/rollback-points`）仍未接，本批只做导入批次回滚 | 已接入（存点 B） |
| 设置 | 清空数据 | `DELETE /data/all`、`DELETE /data/transactions`（`confirm=clear-all`） | 已接（API 模式）：必须先在本次会话导出备份，再输入「清空账本」二次确认；无备份时按钮给出拦截文案；清空后同时删除回收站审计事件与导入批次 | 无 | 已接入 |
| 设置 | 自动备份 | `GET/PUT /data/auto-backup` | 无 UI | 接开关与状态 | B |
| 设置 | 回收站 | `GET /transactions/recycle-bin`（含 `list` / `accounts` / `categories`）+ `POST /audit-events/:id/undo` | 已接（API 模式）：交易、账户、分类真实条目、数量与恢复；级联删除条目显示「不可恢复」 | 无 | 已接入 |
| 设置 | 同步状态 / 关闭 | **无同步端点**（同步只在 `packages/sync`） | 无 UI | 接口缺；未到里程碑，先不实现 | C |
| 全局 | 三态（加载/空/错） | 不适用 | 总览、流水、设置（账户/分类/回收站）已由真实请求驱动（加载 / 空结果 / 失败重试）；报表、预算仍是种子假设 | 每页接入时复用 `DataState`，不要用种子兜底 | — |

## 本批：流水（已完成，2026-11-06）

**新增端点：0 个；`GET /transactions` 新增参数：`keyword`、`amountMin`、`amountMax`（整数分，仅 list）。**

1. 读：列表/分页/筛选接 `GET /transactions`；`categoryIds` → 重复 `categoryId`；期间/分类/关键词/类型/账户全部直传服务端，前端不再本地过滤。无可见分页控件，按 `pageSize=100` 自动翻到 `total`。深链请求等账本就绪且防抖落到最终筛选后才发，请求数 = `ceil(total/100)`。
2. 关键词口径：只搜备注 / 账户 / 分类 / 方向，不搜金额文本；金额有独立区间筛选。种子版与 API 版同一关键字返回同一规则下的结果。
3. 写：新增/编辑/删除改真实 mutation；失败保留输入或表单、回显错误并可重试；成功后失效总览/流水/回收站三组查询。
4. 删除 / 撤销：逐条 `DELETE` 收集 `auditEventId`，6 秒 toast 撤销走 `POST /audit-events/:id/undo`；过期记录进 `GET /transactions/recycle-bin`。
5. 回收站：设置页 API 模式显示真实条目、数量与恢复（`deleteEventId`），种子模式保持原空态。
6. 批量：改分类/删除均为逐条请求，请求数 = 选中笔数，非原子；部分失败保留失败项并提示。

**本批未做（留到下一批）**：退款关联原交易（`relatedTransactionId` / `GET /transactions/refundable`）；`PUT` 的 6 秒撤销（后端不返回审计 id）；流水页独立回收站入口。

## 本批：设置（已完成，2026-11-06）

**新增端点：0 个。扩展现有端点：`POST /accounts` 接受 `sort`；`DELETE /accounts/:id`、`DELETE /transaction-categories/:id` 返回 `auditEventId`；`GET /transactions/recycle-bin` 响应追加 `accounts` / `categories`。**

1. 账户：创建/编辑/删除/排序真写；账户性质映射顶级账户分类；编辑「当前余额」按差额修正 `initialBalance`，与 `GET /accounts/:id/balance-at` 同口径；删除被交易/预算等引用时后端拒绝，前端原样提示原因，不假装成功。
2. 分类：两级增删改、`parentId`、`PUT /transaction-categories/:id/move`、`PUT /transaction-categories/sort/batch` 真写；展示 id ↔ 真实 id 经映射层转换；流水与报表的层级展示逻辑未改。
3. 撤销 / 回收站：删除返回 `auditEventId`，6 秒内走 `POST /audit-events/:id/undo`；账户按 `beforeJson` 重建，分类按快照重建并把已转移交易回填；过期条目进回收站，级联删除（force / 连交易删）标记「不可恢复」。
4. 失效查询：写后失效总览 / 流水 / 报表 / 预算 / 回收站五组查询。
5. 失败路径：断网或接口造错时表单/弹层保留、错误可见、解除后可重试。

**本批未做（留到后续）**：退款关联；报表/预算页接入。

## 本批：导入 / 导出 / 导入回滚 / 清空（已完成，2026-11-06）

**新增端点：2 个。** `GET /data/import-batches?limit=`（默认 10，1–50）；`POST /data/import-batches/:id/rollback`（确认值 `rollback-import`，与导入/导出/清空共用长任务互斥）。其余复用：`GET /data/export-full`、`POST /data/import-preview`、`POST /data/import-backup`、`DELETE /data/all`、`DELETE /data/transactions`。

1. 导出：`GET /data/export-full` 返回 `.mbx`（ZIP 内容 + `.mbx` 扩展名，文件名 `moneybrain-backup-YYYY-MM-DD.mbx`）；前端从 `Content-Disposition` 取名下载，导出成功才把「已备份」记入本次会话。
2. 导入：先 `POST /data/import-preview` 出摘要（期间跨度 / 文件笔数 / 金额合计 / 未知账户与分类 / 疑似重复），确认后 `POST /data/import-backup` 写库并返回 `importId`；预览与正式导入共用同一解析器，数字不漂移。批次记录 `transactionCount` 可在 `GET /data/import-batches` 查到。
3. 回滚：导入前记录各表 id 基线，导入后求差把本批新建行写入 `ImportBatch.createdJson`；`POST /data/import-batches/:id/rollback` 只删这些 id（硬删除），不误删导入前数据，也不恢复 merge 更新；返回 `removedTransactions`。
4. 清空：`DELETE /data/all` 除业务表外一并删除 `auditEvent`（回收站）与 `importBatch`（导入记录），清空后总览/流水/报表/预算查询全部失效重取。
5. 事务边界：导入的解析、写库、批次记录在同一事务内；任一步失败整批回滚，不留半截数据，也不留批次记录。导入/导出/回滚/清空通过长任务互斥避免并发互相覆盖。
6. 三态：四个操作均有进行中 / 成功 / 失败态；失败保留弹层与原始输入，可直接重试。清空未导出备份时按钮可点但拦截，并给出「请先导出备份：备份成功后才会继续清空」。

**本批未做（留到后续）**：存点回滚（`/data/rollback-points` 系列）仍为种子行为；退款关联；报表/预算页接入。

## 下一批：报表

**实际顺序**：总览（已接）→ 流水（已接）→ 设置（本批，用户指定提前）→ **报表** → 预算。

**前置条件**：

1. 四视图改端点口径：`/reports/balance-sheet`（时点）、`/income-expense`、`/cash-flow`、`/investment-analysis`。
2. 下钻复用流水批次已通的筛选：`categoryIds` → 重复 `categoryId`，并带 `startDate/endDate`。
3. 三态与空报表复用 `DataState`；不要用本地 derive 兜底真实数据。

**预算为什么排在报表之后**：预算的两个口径缺口（周期混算、账户绑定漏计）必须先拍板再接线；报表不依赖它们。
