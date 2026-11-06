# HF × API 缺失清单（2026-11-06）

> 对照 `apps/api` 路由与 `packages/contracts/types`，逐页列出「接口有什么 / 前端缺什么 / 接上要改哪一层」。
> 状态基准：总览（只读）、流水（读写、审计撤销、回收站、退款关联原交易）、报表（四视图端点口径）、设置（账户/分类读写、排序、撤销、回收站、导入/导出/导入回滚/清空）已接真实账本（`VITE_HF_DATA=api`）；预算仍在内存种子账本上。
> 阻塞级别：**A = 会挡住接入**；**B = 只是体验缺失**；**C = 已知占位 / 未到里程碑**。

## 结论先行

- **本批新增端点：0 个**。报表四视图复用既有 `GET /reports/balance-sheet`、`/reports/income-expense`、`/reports/cash-flow`、`/reports/investment-analysis` 与 `/analytics/asset-trend`、`GET /transactions`、`GET /accounts`、`GET /budgets/statuses`；此前导入导出批新增 2 个（`GET /data/import-batches`、`POST /data/import-batches/:id/rollback`）；设置批新增 0 个，只扩展现有端点：`POST /accounts` 接受 `sort`；`DELETE /accounts/:id`、`DELETE /transaction-categories/:id` 返回 `auditEventId`；`GET /transactions/recycle-bin` 响应追加 `accounts` / `categories`。
- 总览已只读接通；流水已接通读、写、审计撤销、回收站与退款关联；报表已接通四视图端点口径；设置已接通账户与分类的读写、排序/移动、删除撤销、回收站，以及导入/导出/导入回滚/清空。API 模式写操作真写库，种子模式仍走内存。
- **本批新增推演端点 3 个**（后端，未接前端）：`GET /analytics/asset-projection`、`GET /reports/cash-flow-projection`、`GET /budgets/period-plan`；把「未来日期真实交易」与「预算展开」拆成 `committed` / `planned` 两个来源。同一 occurrence 两者都有时互斥：点位从 `planned` 剔除、金额只留在 `committed`，并在点位 `covered[]` 标注。
- 报表/预算的合计不再聚合总览快照：ledger 改为完整分页拉取 `GET /transactions`，跨月/跨年数据不再被最近 8 笔窗口截断。
- 接口侧真正缺的只有一件：**没有同步端点**（同步能力还在 `packages/sync`，未到里程碑，不阻塞当前接入）。
- 下一批建议做**预算**：真实 CRUD + `statuses` 口径，先拍板「周期混算」与「账户绑定」两个产品口径。

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
| 流水 | 退款 / 关联原交易 | `POST/PUT /transactions` 支持 `relatedTransactionId`（可空）；`GET /transactions/refundable/list` | 已接：编辑器/详情可选关联原交易，退款行标「关联 #原交易」、原交易行标「已退款 / 已全额退款」；未关联退款可记账并标「未关联原交易」；累计退款超原额后端拒绝 | 无（退款关联的编辑入口在详情抽屉内） | 已接入 |
| 报表 | 资产负债表 | `GET /reports/balance-sheet?date=`（时点语义）+ `GET /analytics/asset-trend` | 已接（API 模式）：资产/负债/净资产/流动资产的合计用端点 `actual`；账户子节点来自 `byAccount`，走势取 `asset-trend` | 无；时点控件保留，越界时点收敛到锚点 | 已接入 |
| 报表 | 收支明细 | `GET /reports/income-expense?startDate&endDate` | 已接：期间切换按接口语义逐桶查询；分类树与收入/支出/结余均取端点 `actual` | 无 | 已接入 |
| 报表 | 现金流量表 | `GET /reports/cash-flow?startDate&endDate` | 已接：`startCash`/`endCash`、`byActivity` 四项与每项 `inflow/outflow/net/items` 直接映射；分类以后端 `cashFlowType` 为准 | 无 | 已接入 |
| 报表 | 投资分析 | `GET /reports/investment-analysis?startDate&endDate` | 已接：`totalInvestment`、`returnAnalysis`、`byAccountAllocation` 映射持仓；无持仓明细时回退 `byCategory`，无投资账户返回空态 | 无 | 已接入 |
| 报表 | 四个「配置」按钮 | 无对应端点（属于展示设置，不是数据接口） | 已落 `localStorage` 展示设置（分组口径/具名类别/活动分组显隐/目标与排序与快照数）；接真数据后仍只影响展示，不写回 | 无；不需要新端点 | 已接入 |
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
| 全局 | 三态（加载/空/错） | 不适用 | 总览、流水、报表、设置（账户/分类/回收站）已由真实请求驱动（加载 / 空结果 / 失败重试）；预算仍是种子假设 | 预算接入时复用 `DataState`，不要用种子兜底 | — |

## 本批：流水（已完成，2026-11-06）

**新增端点：0 个；`GET /transactions` 新增参数：`keyword`、`amountMin`、`amountMax`（整数分，仅 list）。**

1. 读：列表/分页/筛选接 `GET /transactions`；`categoryIds` → 重复 `categoryId`；期间/分类/关键词/类型/账户全部直传服务端，前端不再本地过滤。无可见分页控件，按 `pageSize=100` 自动翻到 `total`。深链请求等账本就绪且防抖落到最终筛选后才发，请求数 = `ceil(total/100)`。
2. 关键词口径：只搜备注 / 账户 / 分类 / 方向，不搜金额文本；金额有独立区间筛选。种子版与 API 版同一关键字返回同一规则下的结果。
3. 写：新增/编辑/删除改真实 mutation；失败保留输入或表单、回显错误并可重试；成功后失效总览/流水/回收站三组查询。
4. 删除 / 撤销：逐条 `DELETE` 收集 `auditEventId`，6 秒 toast 撤销走 `POST /audit-events/:id/undo`；过期记录进 `GET /transactions/recycle-bin`。
5. 回收站：设置页 API 模式显示真实条目、数量与恢复（`deleteEventId`），种子模式保持原空态。
6. 批量：改分类/删除均为逐条请求，请求数 = 选中笔数，非原子；部分失败保留失败项并提示。

**本批未做（留到下一批）**：`PUT` 的 6 秒撤销（后端不返回审计 id）；流水页独立回收站入口。

## 本批：设置（已完成，2026-11-06）

**新增端点：0 个。扩展现有端点：`POST /accounts` 接受 `sort`；`DELETE /accounts/:id`、`DELETE /transaction-categories/:id` 返回 `auditEventId`；`GET /transactions/recycle-bin` 响应追加 `accounts` / `categories`。**

1. 账户：创建/编辑/删除/排序真写；账户性质映射顶级账户分类；编辑「当前余额」按差额修正 `initialBalance`，与 `GET /accounts/:id/balance-at` 同口径；删除被交易/预算等引用时后端拒绝，前端原样提示原因，不假装成功。
2. 分类：两级增删改、`parentId`、`PUT /transaction-categories/:id/move`、`PUT /transaction-categories/sort/batch` 真写；展示 id ↔ 真实 id 经映射层转换；流水与报表的层级展示逻辑未改。
3. 撤销 / 回收站：删除返回 `auditEventId`，6 秒内走 `POST /audit-events/:id/undo`；账户按 `beforeJson` 重建，分类按快照重建并把已转移交易回填；过期条目进回收站，级联删除（force / 连交易删）标记「不可恢复」。
4. 失效查询：写后失效总览 / 流水 / 报表 / 预算 / 回收站五组查询。
5. 失败路径：断网或接口造错时表单/弹层保留、错误可见、解除后可重试。

**本批未做（留到后续）**：报表/预算页接入。

## 本批：导入 / 导出 / 导入回滚 / 清空（已完成，2026-11-06）

**新增端点：2 个。** `GET /data/import-batches?limit=`（默认 10，1–50）；`POST /data/import-batches/:id/rollback`（确认值 `rollback-import`，与导入/导出/清空共用长任务互斥）。其余复用：`GET /data/export-full`、`POST /data/import-preview`、`POST /data/import-backup`、`DELETE /data/all`、`DELETE /data/transactions`。

1. 导出：`GET /data/export-full` 返回 `.mbx`（ZIP 内容 + `.mbx` 扩展名，文件名 `moneybrain-backup-YYYY-MM-DD.mbx`）；前端从 `Content-Disposition` 取名下载，导出成功才把「已备份」记入本次会话。
2. 导入：先 `POST /data/import-preview` 出摘要（期间跨度 / 文件笔数 / 金额合计 / 未知账户与分类 / 疑似重复），确认后 `POST /data/import-backup` 写库并返回 `importId`；预览与正式导入共用同一解析器，数字不漂移。批次记录 `transactionCount` 可在 `GET /data/import-batches` 查到。
3. 回滚：导入前记录各表 id 基线，导入后求差把本批新建行写入 `ImportBatch.createdJson`；`POST /data/import-batches/:id/rollback` 只删这些 id（硬删除），不误删导入前数据，也不恢复 merge 更新；返回 `removedTransactions`。
4. 清空：`DELETE /data/all` 除业务表外一并删除 `auditEvent`（回收站）与 `importBatch`（导入记录），清空后总览/流水/报表/预算查询全部失效重取。
5. 事务边界：导入的解析、写库、批次记录在同一事务内；任一步失败整批回滚，不留半截数据，也不留批次记录。导入/导出/回滚/清空通过长任务互斥避免并发互相覆盖。
6. 三态：四个操作均有进行中 / 成功 / 失败态；失败保留弹层与原始输入，可直接重试。清空未导出备份时按钮可点但拦截，并给出「请先导出备份：备份成功后才会继续清空」。

**本批未做（留到后续）**：存点回滚（`/data/rollback-points` 系列）仍为种子行为；报表/预算页接入。

## 本批：退款关联原交易（已完成，2026-11-06）

**新增端点：0 个。** 复用 `GET /transactions/refundable/list`（收入/支出中仍有可退余额的记录，最多 200 条、按日期倒序）与 `POST/PUT /transactions` 的 `relatedTransactionId`（创建可空、更新可传 `null` 解除关联）。

1. 关联写入与读取：退款写 `relatedTransactionId` + `relatedType`，并**强制继承原交易分类**与 `excludeFromIncomeExpense`；API 响应与总览最近交易的 include 补齐双向关系（`relatedTransaction` / `refunds`），前端据此算「已退款 / 剩余」。
2. 累计上限：可退余额 = `max(原额 − Σ未删除关联退款, 0)`，由领域层 `remainingRefundable` 单一口径计算；创建与编辑（含改金额、换原交易）都重新校验，超额返回 400 与精确文案：`退款金额超出可退余额：原交易 ¥500.00，已退款 ¥250.00，本次可退 ¥250.00，本次退款 ¥300.00`。软删除退款不计入，撤销恢复后重新计入。
3. 可退列表：`GET /transactions/refundable/list` 过滤掉剩余为 0 的原交易，全额退款后自动移出候选。
4. 未关联退款：允许正常记账（`relatedTransactionId=null`），不参与收入/支出合计，只影响账户余额；UI 标「未关联原交易」，详情抽屉提供可选关联入口，不强制。
5. 删除 / 撤销：删除退款走软删除，原交易「已退款」立即回退、可退余额恢复；审计撤销恢复后重新计入，不留孤儿引用。
6. 统计口径（**实际采纳**）：关联退款冲减原交易那一侧（支出退款减支出、收入退款减收入），**永不另计收入**；未关联退款不进收支、只影响余额；预算按退款自身分类（= 原交易分类）子树统计，与总览/报表同步冲减。原「退款计收入」规则作废，因此不存在「既减支出又计收入」的双计；种子前端已按同一口径改（`refundOffsetKind`），与后端一致。
7. 实测（临时库，原支出 ¥500 → 部分退 ¥250 → 全额退 ¥500）：
   - 无退款：stats `income=0 / expense=500.00`，报表 `expense.actual=500.00`，预算 `used=500.00`，总览 `500.00`。
   - 部分退款：stats `expense=250.00 / refund=250.00`，报表 `expense.actual=250.00`，预算 `used=250.00`，总览 `250.00`。
   - 全额退款：上述四处均为 `0`。
   - 超额：部分退后再退 ¥300 → 400（文案见上）；全额后再退 ¥10 → 400（`本次可退 ¥0.00`）。
   - 删除 ¥250 退款：原交易 `refunds=[50.00,200.00]` 合计 `250.00`，stats `expense=250.00`；撤销后 `refunds=[250.00,50.00,200.00]` 合计 `500.00`，stats `expense=0`。
8. 视觉：三档（1440/1024/390）种子 vs API 行高 54 / 69、金额列宽 54.8125 不变；新增标记 `flex:none` 挂在行内，不改变行高与列宽。截图 `.artifacts/refund-link-2026-11-06/`。

**本批未做**：按「有退款」筛选流水；退款凭证/审批。API 模式日期曾在适配层用 `date.slice(0,10)` 显示、本地午夜序列化后早一天，已在下一节统一修复。

## 本批：日期语义统一（已完成，2026-11-06）

**结论**：账本 `date` 是**本地日历日**（`LocalDate`，`YYYY-MM-DD`），不是 UTC 瞬时；旧前端 `dayjs(transaction.date).format('YYYY-MM-DD')` 按客户端本地时区解析，在 UTC+8 下显示的正是这个日历日，因此沿用该语义、不再引入第二套口径。

**契约**：

| 层 | 规则 |
|---|---|
| 领域层 | `packages/domain/src/date.ts` 的 `LocalDate`；一律本地 `getFullYear/getMonth/getDate`，禁止 `toISOString()` 取日期 |
| 数据库 | 交易日期只存日（本地午夜）；`createdAt` 等时间戳单独存 |
| API 响应 | `apps/api/src/common/http.ts` 统一按字段名序列化：`date` / `startDate` / `endDate` / `initialBalanceDate` → `YYYY-MM-DD`；其余 Date（`createdAt` / `updatedAt` / `deletedAt` / `at`）仍为 ISO 瞬时 |
| 前端 | 只消费字符串：date-only 原样使用；历史 ISO 载荷按本地时区显式解析（`calendarDay`），禁止 `slice(0, 10)` |

**改动**：`convertScalars` 增加字段名识别（覆盖 list / 详情同源 / 回收站 / 预算 / 快照等所有出口）；`apiLedger.ts` 新增 `calendarDay` 替换 `transaction.date.slice(0, 10)`。流水行、详情抽屉、报表下钻、预算归属、交易 CSV、预算 JSON 导出全部由同一 date-only 字符串驱动；交易 CSV 与预算 JSON 原本就用本地格式化，未改。

**实测（真实 API + 边界数据）**：

- 创建 2026-11-01 00:05 与 2026-11-30 23:55 两笔：API 返回 `2026-11-01` / `2026-11-30`，列表与报表均只含这 2 笔、`expense=300`；2026-10-31 23:55 与 2026-12-01 00:05 两笔不进入本期。
- 跨年 2026-12-31 23:55 与 2027-01-01 00:05：单日区间各自只返回 1 笔，合计区间 `expense=300`。
- 预算月度周期：上述 4 笔中只计本期首末两笔，`used=300`。
- 导出：交易 CSV 含 `2026-11-01 00:05:00` / `2026-11-30 23:55:00`；预算 JSON `startDate` 为 `2026-01-01`。
- 三种时区（UTC+8 / UTC-5 / UTC）跑同一份断言全部通过；同一 date-only 字符串在三种时区下显示同一日历日。

**旧 ISO 兼容**：若外部仍传来旧序列化 ISO，前端按本地时区显式解析（与旧前端一致）。这类载荷本身不具跨时区不变性，修复后的后端不再产生。

**回归**：`apps/api/tests/unit/http-date-serialization.test.ts`（3 条）、`apps/api/tests/integration/date-contract.test.ts`（8 条，三时区各跑一次）、`apps/web/tests/unit/overview-api-ledger.test.ts` 新增 5 条（含「不再 slice 截断」源码断言）。


## 本批：报表四视图接入（已完成，2026-11-06）

**新增端点：0 个。** 四视图全部改为端点口径，前端不再重算。图形实现（`charts.tsx`、`CashSankey.tsx`、`DonutChart`）未改，只改数据接入层。

**视图 / 指标 ← 端点 ← 字段 / 过滤条件**：

| 视图 / 指标 | 端点 | 字段与过滤条件 |
|---|---|---|
| 资产负债（时点） | `GET /reports/balance-sheet?date=YYYY-MM-DD` | `assets` / `liabilities` / `netWorth` 的 `.actual`、账户子节点 `byAccount`；时点由报表锚点（真实最新流水日）给出，越界收敛到锚点 |
| 资产负债（走势） | `GET /analytics/asset-trend` | 12 个月 `month` / `netWorth`；末点与净资产联动 |
| 收支明细（期间） | `GET /reports/income-expense?startDate&endDate` | `income.actual`、`expense.actual`、`balance.actual`、分类树 `items`；期间切换逐桶查询，前端不再按日过滤 |
| 现金流（期间） | `GET /reports/cash-flow?startDate&endDate` | `startCash` / `endCash`、`byActivity.{operating,investing,financing,uncategorized}` 的 `inflow/outflow/net/items`；桑基的期初/期末与毛额直接取这两个字段 |
| 投资分析（期间） | `GET /reports/investment-analysis?startDate&endDate` | `totalInvestment`、`returnAnalysis`、`byAccountAllocation`（无 items 时回退 `byCategory`） |
| 报表/预算锚点 | `GET /transactions`（完整分页）、`GET /accounts`、`GET /budgets/statuses` | 交易 `date` / `total` 定锚点与期间；账户 `kind` 判流动资产；预算 `usedSum` 对账 |

**逐视图对账（真实库，2026-11-06，分 ↔ 元）**：

- 资产负债：总资产 `15,172,915` 分 = ¥151,729.15、总负债 `211,840` = ¥2,118.40、净资产 `14,961,075` = ¥149,610.75、流动资产 ¥5,002.20；资产环合计 = ¥151,729.15，信用卡（负债）不进环。
- 收支明细 2026-11：收入 ¥18,500.00、支出 ¥6,277.60、结余 ¥12,222.40；跨月切到 2025-12：收入 ¥16,500.00（后端 `1,650,000` 分，改前显示 0）。
- 现金流 2026-11：期初 ¥4,826.20（`482,620`）、期末 ¥5,002.20（`500,220`）、经营净额 −¥324.00；桑基 `diff=0`。
- 投资分析：总市值 ¥86,450.00（`8,645,000`）、累计收益 0、XIRR 0。
- 预算 2026-11：`statuses.usedSum` = `623,760` 分 = ¥6,237.60，与 UI 合计一致。

**桑基逐月守恒差值（真数据）**：

| 月份 | 差值（分） | 说明 |
|---|---|---|
| 2025-12 ～ 2026-09 | 0 | 无流水，期初 = 期末 |
| 2026-10 | −4,866.00 | 临时库账户 `initialBalanceDate=2026-10-31` 晚于当月流水，后端余额回放不计入期初前的流水；页面显示「不守恒」失败态，不崩溃、不静默改数 |
| 2026-11 | 0 | 期初 482,620 + 毛流入 50,000 − 毛流出 32,400 = 期末 500,220 |

**三态与配置实测**：

- 加载：路由延迟 4 秒时 `.mb-skeleton-page` 可见；空账本显示「还没有可分析的流水」；失败显示「数据没取出来」+ 重试，解除失败后重试成功加载指标。
- 配置（API 模式逐个生效，非 GET `/api` 请求 0 条）：①资产负债「按性质汇总」表结构变化；②收支明细「笔数」列消失；③现金流隐藏「未分类」且桑基仍 `diff=0`；④投资「目标比例」在种子模式验证同一组件链路（API 持仓无 `items`，目标列无数据可显）。
- 截图：`.artifacts/r3-work/shots/`（三档 1440/1024/390 种子 vs API、三态、配置、跨年、K6/K7）。

**三条阻断与 K6/K7（同批修复）**：

- Z1 完整期间：ledger 改 `GET /transactions` 完整分页（`pageSize=200` 翻到 `total`），不再用总览 8 笔；跨月/跨年 UI 合计 = 后端直查。
- Z2 写侧日历日：`POST/PUT` 的 date-only 由 `parseDateLocal` 解释为本地零点，响应与读回均无 `T16:00Z`；断言「保存后读回同一天」。
- Z3 锚点：`ledgerAnchorDay` 取 `snapshot.today` 与最新流水的较晚者；真实 11 月可切，预算「下一个月」有数据时可点。
- K6：无数据月份禁用「下一个月」时必须显示「2026 年 12 月无流水」，不能只置灰。
- K7：空预算页页头「新增」隐藏，页面级主按钮只留「新增预算条目」。

**断言**：`apps/web/tests/unit/api-reports.test.ts`（视图↔端点映射、期间边界、锚点、桑基守恒、配置、无写调用、完整分页）、`budget-month-k6.test.tsx`、`budget-empty-k7.test.tsx`、`apps/api/tests/integration/date-contract.test.ts`（写侧日历日）。

**遗留 / 下一批**：

- 预算页仍为种子：真实 CRUD + `statuses` 口径，先拍板周期混算与账户绑定。
- 投资 API 持仓无 `items`，目标比例列无数据可显；需要后端补资产分类明细，或接受该列为空。
- 报表下钻到流水的 `from/to` 尚未带上（B）。
- DB 的 date 列仍是 DateTime（存本地零点瞬时），不是纯日期字符串；需要改 schema 才能彻底消除瞬时，当前读写在日历日语义上已一致。

## 本批：预算推演端点（已完成，2026-11-06）

**新增端点 3 个**（只读 GET；不改任何已有端点的返回结构，新增字段只用新字段名）：

| 端点 | 参数 | 返回字段 |
|---|---|---|
| `GET /api/analytics/asset-projection` | `months=3/6/12`（默认 12）、`asOf=YYYY-MM-DD`（默认今天）、`includePlanned=true/false`（默认 true）、`includeCommitted=true/false`（默认 true） | `asOf`、`months`、`base{assets,liabilities,netWorth}`、`points[{label,date,actual{…},planned{…},committed{…},total{…},covered[]}]` |
| `GET /api/reports/cash-flow-projection` | 同上 | `asOf`、`months`、`startCash`、`endCash`、`points[{label,date,inflow{actual,planned,committed,total},outflow{…},net{…},startCash,endCash,covered[]}]` |
| `GET /api/budgets/period-plan` | `fromMonth=YYYY-MM`（默认当前月）、`months=1–24`（默认 12） | `fromMonth`、`months`、`points[{month,hasBudget,budgets[{budgetId,budgetName,type,date,amount}],totals{income,expense,transfer}\|null}]` |

**`covered[]` 字段**（两个推演端点一致）：本月计划点位被真实交易覆盖时逐条列出，字段为 `budgetId`、`budgetName`、`type`（`income`/`expense`/`transfer`）、`date`（预算点位日期）、`amount`（被剔除的 planned 金额，整数分）、`transactionId`、`transactionDate`。该数组只列本月（`label`）被覆盖的点位；被覆盖金额已从 `planned` 剔除，只留在 `committed`。

**口径（硬约束）**：

1. `actual` = `date ≤ asOf` 的真实交易余额；未来日期真实交易**不**计入起点，也不进入 `actual`。
2. `committed` = `asOf < date ≤ 月末` 的真实交易累计增量，只来自真实交易。
3. `planned` = 同一窗口的预算展开累计增量，只来自 `generatePredictedOccurrences`（合成交易），已剔除被真实交易覆盖的点位。
4. `total = actual + planned + committed`，逐项相加；两个未来来源互不重叠，同一 occurrence 只出现一次。
5. **同一 occurrence 互斥**（落在 `projection.service.ts`，前端不做抵扣）：预算点位与其所属周期内的真实交易视为同一笔计划，需同时满足「类型相同 + 来源账户相同 + 转入账户相同（非转账两侧都为 `null`，转账必须同源同目标）+ 真实交易日期在 `[periodStart, periodEnd]` 内」。金额与分类不参与匹配；`committed` 按日期升序贪心匹配，一笔真实交易最多覆盖一个点位。命中后该点位从 `planned` 剔除，金额只出现在 `committed`，并在 `covered[]` 标注。只关掉 `includeCommitted` 时不匹配，`planned` 回到未兑现的原始展开。
6. 资产口径只做预算展开 + 已排定交易，不做统计外推、不推定投资收益。
7. 现金流 `流入 − 流出` 与交易对现金余额的净影响同源（同一份复式分录）；现金账户互转本金不计流入/流出、手续费计流出，`endCash = startCash + net` 恒成立。
8. `hasBudget=false` 时 `totals=null`——无预算月份不用 0 冒充。

**手算对照（临时库，asOf=2026-11-06；单位分）**：

账本：A 现金期初 0 + 11-01 已发生收入 20000；B 投资期初 30000（非现金）；L 信用卡期初 −10000；未来真实交易 11-20 支出 3000、12-05 收入 8000、12-15 A→B 转账 1000；月度预算 收入 50000 / 支出 10000 / 转账 2000（均月末）。

occurrence 覆盖：11 月支出预算被 11-20 支出覆盖；12 月收入预算被 12-05 收入覆盖；12 月转账预算被 12-15 转账覆盖（同源 A、同目标 B）。

资产推演（每格 `assets / liabilities / netWorth`）：

| 月份 | actual | planned（累计，已剔除覆盖点） | committed（累计） | total | 核对 |
|---|---|---|---|---|---|
| 2026-11 | 50000 / 10000 / 40000 | 50000 / 0 / 50000 | −3000 / 0 / −3000 | 97000 / 10000 / 87000 | 50000 + 50000 − 3000 |
| 2026-12 | 50000 / 10000 / 40000 | 40000 / 0 / 40000 | 5000 / 0 / 5000 | 95000 / 10000 / 85000 | 50000 + 40000 + 5000 |
| 2027-01 | 50000 / 10000 / 40000 | 80000 / 0 / 80000 | 5000 / 0 / 5000 | 135000 / 10000 / 125000 | 起点净资产 40000 + 累计结余 85000 |

现金流推演（现金账户 A）：

| 月份 | 期初 | 流入 actual / planned / committed | 流出 actual / planned / committed | 净额 | 期末 |
|---|---|---|---|---|---|
| 2026-11 | 0 | 20000 / 50000 / 0 | 0 / 2000 / 3000 | 65000 | 65000 |
| 2026-12 | 65000 | 0 / 0 / 8000 | 0 / 10000 / 1000 | −3000 | 62000 |
| 2027-01 | 62000 | 0 / 50000 / 0 | 0 / 12000 / 0 | 38000 | 100000 |

每月 `期初 + 净额 = 期末`；资产 `起点净资产 40000 + 累计结余 85000 = 125000`。3/6/12 切换：同一 `asOf` 下 12 个月的前 6 个点与单独请求 6 个月逐字段相等。

**同一 occurrence 双计对照（房租专用账本）**：现金账户 A 期初 0、asOf 前无交易；月度支出预算「房租」20000（月末点位）；已排定 12-05 真实支出 20000（同账户、同类型）。12-31 点位与 12-05 交易为同一 occurrence：

| 月份 | 改前 planned / committed / total | 改后 planned / committed / total | 双计 |
|---|---|---|---|
| 2026-11 | −20000 / 0 / −20000 | −20000 / 0 / −20000 | 0 |
| 2026-12 | −40000 / −20000 / **−60000** | −20000 / −20000 / **−40000** | 20000 |
| 2027-01 | −60000 / −20000 / **−80000** | −40000 / −20000 / **−60000** | 20000（累计保留） |

现金流同账本：12 月流出改前 `planned 20000 + committed 20000 = 40000`、期末 −60000；改后 `planned 0 + committed 20000 = 20000`、期末 −40000。该用例的逐点断言（含 `covered` 的 budgetId / date / amount / transactionId / transactionDate）在 `projection.route.test.ts` 的「同一 occurrence 的 planned 与 committed 互斥（房租账本）」中。

**预算展开语义修复**：`generateBudgetTimePoints`（原 `generateTimePoints`）只返回 `[start, end]` 内的点；季度/年度 `transactionTime` 明确为「从周期起点起的天偏移」，窗口起点之前的落点被裁掉（月度几号同理）。否则长期推演会把已经过去的本期点位重复带进未来。

**验证**：`apps/api/tests/integration/projection.route.test.ts`（8 条）、`apps/api/tests/unit/budget-time-points.test.ts`（3 条）；api 全量 `npm test` 51 文件 416 用例通过，`npm run typecheck` 全量 0 错，`apps/api` 改动文件 ESLint 0 error（contracts 文件提示 outside of base path）。

## 下一批：预算

**实际顺序**：总览（已接）→ 流水（已接）→ 设置（已接）→ 报表（本批已接）→ **预算**。

**前置条件**：

1. 预算 CRUD 走 `/budgets`，已用/超支走 `/budgets/statuses`，写后失效 `['hf','budgets']`。
2. 先拍板两个口径：头部「本月可花」只取月度预算还是并入周/年；账户绑定漏计按分类全账户还是按 `accountId`。
3. 三态复用 `DataState`；本月锚点继续跟 `ledgerAnchorDay` 走，无数据月份给可见原因（K6 已落地）。
