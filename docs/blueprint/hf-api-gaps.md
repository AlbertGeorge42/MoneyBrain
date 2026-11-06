# HF × API 缺失清单（2026-11-06）

> 对照 `apps/api` 路由与 `packages/contracts/types`，逐页列出「接口有什么 / 前端缺什么 / 接上要改哪一层」。
> 状态基准：总览已只读接入（`VITE_HF_DATA=api`），其余四页仍在内存种子账本上。
> 阻塞级别：**A = 会挡住接入**；**B = 只是体验缺失**；**C = 已知占位 / 未到里程碑**。

## 结论先行

- **本批新增端点：0 个。** 总览所需数据现有端点全部覆盖；唯一代价是账户余额按账户逐个取（N+1）。
- 总览已接通，但写操作在 API 模式被显式拒绝并提示，不会假装写库。
- 下一批建议做**流水**；它的真实删除/撤销/回收站链路是预算与设置可信写入的前提。
- 接口侧真正缺的只有一件：**没有同步端点**（同步能力还在 `packages/sync`，未到里程碑，不阻塞当前接入）。
- 报表四视图、分类父子结构、账户余额时点快照**接口都已有**；缺的是前端接线，不是后端能力。

## 缺失清单

| 页 | 能力 | 接口现状 | 前端现状 | 缺什么 | 阻塞级别 |
|---|---|---|---|---|---|
| 总览 | 净资产 / 本月收支 / 最近流水 | `GET /analytics/dashboard`（本月/上月 + recentTransactions）、`GET /accounts` | 已接：dashboard 直接提供收支与最近流水 | 无 | 已接入 |
| 总览 | 净资产走势 | `GET /analytics/asset-trend`（12 个月） | 已接：走势取真实 12 个月，末点随净资产联动 | 无 | 已接入 |
| 总览 | 预算卡 | `GET /budgets` + `GET /budgets/statuses` | 已接：已用金额用后端 statuses | 头部合计仍混算周期（见预算页）；本批未改口径 | B |
| 总览 | 账户余额 | `GET /accounts/:id/balance-at?date=`（单账户） | 已接：`Promise.all` 逐账户取 | 无批量余额端点；账户多时请求数线性增长 | B |
| 流水 | 列表 / 分页 / 筛选 | `GET /transactions`：`page/pageSize/accountId/categoryId[]/type[]/from/to` | 全内存派生；只接了总览 | DTO→流水模型；HF 的 `categoryIds` 要映射成重复 `categoryId` 参数 | A |
| 流水 | 新增 / 编辑 | `POST /transactions`、`PUT /transactions/:id` | 本地 `setLedger` | 真实 mutation、成功后失效查询、失败回显 | A |
| 流水 | 删除 + 6 秒撤销 | `DELETE /transactions/:id` 返回 `auditEventId`；`POST /audit-events/:id/undo` | 本地删除 + 内存重加；6 秒后不可恢复 | 改真实软删 + 审计撤销；失败要回滚列表 | A |
| 流水 | 回收站 | `GET /transactions/recycle-bin`（`RecycleBinItem.deleteEventId`） | 无入口；设置页写死「空的」 | 列表与恢复动作（恢复复用 audit undo）；删除过期自动进回收站 | A |
| 流水 | 批量改分类 | 无批量端点；只能逐条 `PUT /transactions/:id` | 本地批量改 | 可用 N 次请求替代，但需明确非原子；若要原子需新端点 | B |
| 流水 | 退款 / 关联原交易 | `POST` 支持 `relatedTransactionId`；`GET /transactions/refundable` | 无退款关联能力 | 编辑器补关联选择与可退列表 | B |
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
| 设置 | 账户 CRUD / 排序 | `GET/POST/PUT/DELETE /accounts`、`PUT /accounts/sort` | 全本地 | 真实 CRUD；余额变更走账户接口而不是改账本 | A |
| 设置 | 账户分类 | `/account-categories` CRUD + 排序 | 全本地 | 真实 CRUD | A |
| 设置 | 交易分类父子结构 | `/transaction-categories` 含 `parentId`、`move`、`sort` | 本地固定 seed 树 | 真实树 + 移动/排序；报表合并分类下钻用多 `categoryId` | A |
| 设置 | 合并集合（「其余 N 类」） | 无「合并分类」实体端点；流水筛选支持多 `categoryId` | 报表用本地 `mergedIds` | 不需要新端点，接线时把集合映射成重复 `categoryId` | B |
| 设置 | 导入 | `POST /data/detect-file`、`/data/import-preview`、`/data/import-backup` | 本地 toast | 导入向导、预览差异、覆盖/合并确认 | A |
| 设置 | 导出 | `GET /data/export`、`/data/export-full`、`/data/export-custom` | 本地下载内存 JSON | 接真实导出；导出范围与文件字段以后端为准 | A |
| 设置 | 回滚存点 | `/data/rollback-points` CRUD + `POST /data/rollback-points/:id/restore` | 本地 toast | 接存点列表与恢复；恢复后整页失效重取 | A |
| 设置 | 清空数据 | `DELETE /data/all`、`DELETE /data/transactions` | 只清内存 | 接真实清空 + 二次确认 + 失败回显 | A |
| 设置 | 自动备份 | `GET/PUT /data/auto-backup` | 无 UI | 接开关与状态 | B |
| 设置 | 回收站 | `GET /transactions/recycle-bin` | 写死空（[SettingsPage.tsx L1336-L1341](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/settings/SettingsPage.tsx#L1336-L1341)） | 接列表 + `deleteEventId` 恢复；与流水页共用 | A |
| 设置 | 同步状态 / 关闭 | **无同步端点**（同步只在 `packages/sync`） | 无 UI | 接口缺；未到里程碑，先不实现 | C |
| 全局 | 三态（加载/空/错） | 不适用 | 总览已由真实请求驱动；其余页仍是种子假设 | 每页接入时复用 `DataState`，不要用种子兜底 | — |

## 下一批：流水

**顺序**：总览（已接）→ **流水** → 报表 → 预算 → 设置。

**前置条件**：

1. 数据读：`GET /transactions` 分页/筛选接入，`categoryIds` → 重复 `categoryId` 参数；账户、分类下拉复用总览已接的 `/accounts`、`/transaction-categories`。
2. 数据写：新增/编辑/删除改真实 mutation；删除返回的 `auditEventId` 支撑 6 秒撤销；撤销过期后记录出现在回收站。
3. 回收站：流水页先给入口，设置页最后接同一份 `GET /transactions/recycle-bin`。
4. 三态：列表加载、空结果、请求失败分别有真实 UI；写失败必须回显，不得乐观地留在列表里。
5. 退款关联放到流水批次的收尾，不阻塞主链路。

**报表为什么排第三**：报表下钻落到流水页，依赖流水的真实筛选参数；流水没接之前，报表只能继续用本地派生，口径无法与后端对齐。
