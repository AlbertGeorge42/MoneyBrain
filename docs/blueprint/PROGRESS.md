# 蓝图推进状态

> 差距条目完成状态的**唯一来源**。领条目、销条目都在这里登记。
> 已完成条目一行收口：`✅ <提交> · 一句话结论`；细节回查 git 历史，不再复述。
> 未完成条目只在所属阶段文档定义（[stage-0](stage-0-foundation.md)–[stage-4](stage-4-expansion.md)）。
> 不变量覆盖状态见 [../testing.md](../testing.md) §5.1（不变量的唯一来源）。
> **并行会话**：多个会话共用工作区时，只改自己条目对应的行；提交前 `git diff --cached -U1` 逐行核对，不得带入他人未提交改动。

## 状态

| 条目 | 阶段 | 完成于 | 结论 |
|---|---|---|---|
| A0 | 阶段 0 · M0 | 2026-11-03 | ✅ `32f2afe` · 清库三场景集成测试；转账转入本金收进领域层 `transferInflow` |
| A1 | 阶段 0 · M0 | （历史） | ✅ · 历史条目，明细见 git 历史 |
| A2 | 阶段 0 · M0 | （历史） | ✅ · 同上 |
| A3 | 阶段 0 · M0 | 2026-11-03 | ✅ `4b318ba` · fast-check 属性测试覆盖内核不变量 1–6 |
| A5 | 阶段 0 · M0 | 2026-11-04 | ✅ `4cdf29a` · 导出/备份文件名改本地日历日，UTC+8 凌晨不再落到前一天 |
| A6 | 阶段 0 · M0 | 2026-11-04 | ✅ `671787c` + `b51320b` · 全库日期语义改本地日历日；快照 CSV 新格式 + 旧 ISO 兼容 |
| B1 | 阶段 0 · M0 | 2026-10-28 | ✅ `fb87eeb` · 覆盖导入回滚点 + 导入预览 |
| B2 | 阶段 0 · M0 | 2026-11-02 | ✅ `c24b685` · 交易软删除 + 审计事件 + 撤销 + 回收站 |
| B3 | 阶段 0 · M0 | 2026-11-02 | ✅ `e773ff6` · 自动定时备份（24h 到期 + 长任务空闲，用户不设时刻） |
| B4 | 阶段 0 · M0 | 2026-11-03 | ✅ `7196a02` · 退款放开超退/跨账户；`db:verify` 手续费符号修正、超退降为信息提示 |
| C1 | 阶段 0 · M0 | 2026-11-03 | ✅ `4e6878e` · 四张报表共享一个全局期间；余额类指标统一带「期末」 |
| C2 | 阶段 0 · M0 | 2026-11-03 | ✅ `a3f61cd` · 预算下钻与用量同源（`budgetContributionSign`），新增 usage-details API |
| C3 | 阶段 0 · M0 | 2026-11-03 | ✅ `4612b5b` · 预算使用率不截断，超支显示真实百分比 |
| C4 | 阶段 0 · M0 | 2026-11-03 | ✅ `062505d` · 桑基图退款方向改走 `refundOffsetKind`，与活动表同源 |
| D1 | 阶段 0 · M1 | 2026-11-03 | ✅ `662ebb3` · 七个实体收进 repository，service 层 `prisma.<model>.` 归零 |
| D2 | 阶段 0 · M1 | 2026-11-03 | ✅ `048df1e` · 共享类型收敛 contracts（`TransactionType` / `AutoBackupConfig` / `SankeyLink`） |
| D3 | 阶段 0 · M1 | 2026-11-03 | ✅ `3161237` · API 响应类型收敛 contracts（22 处内联换 14 个具名类型；`TransactionStats` 单一来源） |
| D5 | 阶段 0 · M1 | 2026-11-03 | ✅ `41b80bd` · 删桶导出、react-refresh 警告归零（消费者直连源文件） |
| D6 | 阶段 0 · M1 | 2026-11-03 | ✅ `005faff` · SQLite WAL + busy_timeout + 长任务真串行队列；并发写 5 用例全过 |
| D7 | 阶段 0 · M1 | 2026-11-03 | ✅ `fe79d32` · 软删除索引改 `[deletedAt, date]`，列表/统计扫描收敛到期间 |
| D8 | 阶段 0 · M1 | （历史） | ✅ · 历史条目，明细见 git 历史 |
| D9 | 阶段 0 · M1 | 2026-11-04 | ✅ `5ffe91c` · `report.utils` 拆为 period / prediction / cash-flag / account-sum |
| D10 | 阶段 0 · M1 | 2026-11-04 | ✅ `85ac424` · 事务边界统一 `withTransaction`，clear-data / import 残留直调改走 repository |
| D11 | 阶段 0 · M1 | 2026-11-04 | ✅ `777fd70` · 账户分类回填与写入映射、退款 `relatedType` 同步、分页 id 次序键 |
| U0 | 阶段 1 · M2 | 2026-11-03 | ✅ `a60a135` · AntD cssVar 前缀 mb → ant，`--mb-*` 与 `--ant-*` 重叠归零 |
| U1 | 阶段 1 · M2 | 2026-11-04 | ✅ `137af85` · 清除 6 处未定义 `--mb-*` 引用（引用即定义） |
| U1b | 阶段 1 · M2 | 2026-11-04 | ✅ `e6f3f5f` · CSS 变量守卫三条规则（引用完整性 / 禁 `--ant-*` / 死变量白名单） |
| UX1 | 阶段 1 · M2 | 2026-11-03 | ✅ `855741d` · 信息架构：主导航 5 项、层级约束、归属判断表 → `ux/information-architecture.md` |
| UX2 | 阶段 1 · M2 | 2026-11-03 | ✅ `855741d` · 核心交互模型：记账 / 搜索 / 批量 / 报表 / 预算 / 数据 → `ux/interaction-spec.md` |
| UX3 | 阶段 1 · M2 | 2026-11-03 | ✅ `855741d` · 两端差异规范与浮层宿主规则 → `ux/platform-design.md` |
| UX4 | 阶段 1 · M2 | 2026-11-03 | ✅ `3f89b2c` · 设计 token 与暗色方案 → `ux/design-tokens.md`（初稿 `855741d`，darkfirst 终稿 `3f89b2c`） |
| UX5a | 阶段 1 · M2 | 2026-11-04 | ✅ `b121868` · 九类工作流双端线框概念稿定稿（W1–W9；初稿 `855741d`） |
| F-A | 阶段 2 · M4 | 2026-11-04 | ✅ `e2b4820` · 六类可同步实体补 `rev`/`vv`，客户端 UUID 幂等入库，`ledgerId`/`deviceId` 持久化 + AAD |
| F-B | 阶段 2 · M4 | 2026-11-04 | ✅ `ffc3f16` · `packages/sync` 记录级合并（顺序无关/幂等）+ 冲突收敛 + 引用待补全；`sync_conflicts` 本地表 |
| F-C | 阶段 2 · M4 | 2026-11-05 | ✅ `3f3de80` · 加密容器（Argon2id + XChaCha20-Poly1305）备份/同步共用；前链不入同步记录、应用后按唯一规则重算；逐条校验 + 未知实体跳过；格式文档 + 独立解密脚本 |
| V5 | 阶段 4 · 前置 spike | 2026-11-05 | ✅ · 两实例目录同步收敛（3 轮 + 复读 `identical=true`、并发冲突同版、半文件被拒）；默认 KDF seal 1499.6 ms / open 1430.1 ms < 2s；结论可冻结，产物标注 spike |

## 条目处置（一行）

D4 取消（不降级、不保留）、U13.1–U13.5 取消，前端改为「HF 高保真设计（A 设计即代码）→ R1–R3 重建」（[决策 #42](principles.md)）；U2/U3 降为原则（[dev-guide §2.1/§2.2](../dev-guide.md)）；U4/U6/U7 并入 R2/R3 验收；U5/U8–U11 取消；E1–E4 并入 R2，E6 并入 R3；U12 保留至 R3 后；H8 移非目标；A4 候选（[principles](principles.md) #22）；明细见 2026-11-04 版 git 历史。

## 待领（两条并行通道，每通道一次只领一条）

**前置 spike（不计入待领条数）**：`V5` 已完成（2026-11-05，结论见 [stage-4](stage-4-expansion.md)：「可冻结」）；`R1` 后立刻做 `V1`（K8 前置）；
`V2/V3` 在 `H-A` 前、`V4` 在 `I-A` 前，见 [stage-3](stage-3-mobile.md) / [stage-4](stage-4-expansion.md)。

**通道 A · 后端（8 条待领）：**

`G-A` →（等待 `R2c` + `L1–L3`）→ `H-A` → `H-B` → `H-C` → `G-B` → `G-C` → `I-A` → `I-B`

**通道 B · 前端（11 条）：**

`HF（UX5b）` → `R1` → `R2a` → `R2b` → `R2c` → `R3` → `U12`；`L1–L3` 在 `R1` 后并行；`K8` 在 `R3` + `V1` 后

- **HF 产出形态已拍板**：A 设计即代码（可运行 React + Mantine 8 页面；决策 #40a）；B 设计稿已否决。**HF 成品仍未确认（进行中）**，确认后才算完成。
- **并行**：后端通道 `F-A → …` 与前端 `HF` 可同时进行（互不依赖）；**HF 成品确认 → `R1` 定稿是硬边**。R1 已提前落地（`8af8bb6` / `8b4f3ab`），但 HF 未确认前按「提前落地、待定稿」处理；生产报表只开放收支明细 / 资产负债两个视图，现金流与投资分析仅 `/design` 预览。
- 阶段 1 的 11 条见 [stage-1](stage-1-experience.md)；阶段 2 的 3 条见 [stage-2](stage-2-sync.md)；阶段 3 的 5 条见 [stage-3](stage-3-mobile.md)。
- 两条通道各领一条：单个会话一次只做一条；并行会话可在不同通道各领一条，同通道内严格按箭头顺序，且不得依赖对方未完成的条目。
- **硬边界**：`HF 确认 → R1 定稿`（R1 提前落地不视为越过）；`F-C → V5`；`R2c + L1–L3 → H-A`（手机复用重建后的 feature/query 层与文案目录）；`G-A → H-C`；`R3 + V1 → K8`；`R3 → U12`；`H-C → G-B/G-C`；`V4 → I-A`。
- `F` 批在 `R2a–R2c` 期间并行；`G-A` 在 `H` 之前（搬账 / 恢复先于手机容器导入导出）；`G-B/G-C` 起属 M5，必须在移动端可用之后。

## 领条目 / 销条目

工作循环（领一条 → 读上下文 → 实现 → 自检 → 销条目 → 清理）见 [AGENTS.md](../../AGENTS.md)；本文件只做登记：领时在「进行中」加一行，销时在「状态」加一行并从阶段文档差距清单删行（保留编号空洞）。

## 进行中

| 条目 | 领取日期 | 范围 |
|---|---|---|
| HF（UX5b） | 2026-11-04 | 前端通道首批（设计即代码）：Mantine 8.3.18 依赖与主题骨架（42 token × 2 scheme）+ 流水/记账/详情高保真页（PC + 移动、四数据态）；第二批：总览页（净资产主卡 / 走势 / 最近流水）+ 冷启动首笔记账闭环；第三批：报表页（月/年时间条、收支明细 / 资产负债 / 现金流 / 投资分析四视图、固定列宽并排表（本轮为 reports 内部表格，通用 `ui/DataTable` 留到 R1 再抽）、纯 SVG 走势与构成图、行详情含「相关流水 · 近 2 笔」与带筛选跳流水、四数据态、移动端 FAB 留白）；第四批：设置页（PC 7 分区左导航 / 移动 7 入口全屏二级页、账户与分类增删改移、现金流与投资类型、列表显示、数据备份与回收站）；第五批：记账浮层（五类型 / 账户 chips + 全部账户二级抽屉 / PC 键盘与移动自绘键盘 / 连记 / 草稿撤销），HF 五页到此全部完成，待审计 P1 收口后报审；真实 API 接线留 R 批。**成品仍待用户确认**（R1 已提前落地，见状态表；确认后 HF 才销条目） |

## 状态

| 条目 | 完成日期 | 结果 |
|---|---|---|
| HF 设计修订（批次 2 流水） | 2026-11-05 | `b3820e6`：`/design?page=transactions` 落地列表（日期分组 / 小计 / 固定列宽 / 页脚合计）、搜索 + 类型 + 高级筛选（PC 内联面板 / 移动底部抽屉）、行详情与编辑、批量选择 / 改分类 / 删除、显示面板（列显隐 + 排序，PC 工具栏 / 移动页头）、四数据态、浅深 × 双端。与线框差异：批量改分类仅允许纯支出或纯收入集合（含转账/退款/调整或混选时禁用并提示，线框未画禁用态）；撤销改为记录级独立闭包、窗口 6 秒；分类图标按规范收为 20px。未做：预览内为 mock 账本，无真实 API；空账本 normal 态仅有代码路径（预览无清空入口） |
| HF 设计修订（批次 3 报表） | 2026-11-05 | `440116f`：`/design?page=reports` 落地资产 / 收支 / 现金流 / 投资四视图与下钻、时间条预设×粒度矩阵、纯 SVG 图表（1:1 viewBox + `CHART_HEIGHT` 单一来源）、PC 表格 / 移动卡片行、报表设置抽屉、四数据态、浅深 × 双端。与线框差异：现金流用分组流向条替代桑基图（桑基留给 R 批）；投资资产分布 / 快照链为 HF 演示数据（末点市值与投资账户余额一致）；下钻「在流水中查看」只切页、未带入分类筛选；移动表格明细降级为卡片行。未做：设置抽屉仅入口占位（随设置批次接入）；真实 API 与清空入口留给 R 批。顺带修正：预览壳 Drawer `inset` 归零，流水详情抽屉右侧裁切一并消失。自查：typecheck 0 错、lint 0 error / 5 既有 warning、test 19 文件 130 用例；实测图表 scaleX=1、轴字号 12/13px、行高 29px、移动触控 44px、console error 0 |
| HF 设计修订（批次 4 设置） | 2026-11-05 | `/design?page=settings` 落地 PC 左导航 7 分区（配置中心 4 + 通用 3）与移动「7 入口 → 全屏二级页」；账户分类（性质分组、编辑/移动/删除保护）、收支分类（收入/支出/转账两级树）、现金流分类（资产标记 + 四类活动）、投资资产类型（目标占比）、列表显示（列显隐 + 排序，与流水页共用 `mb-hf-display`）、数据与备份（真实导出 JSON、导入入口、回滚/清空两步确认）、回收站空态；四数据态、浅深 × 双端。与线框差异：现金流「资产分类」以账户为行（不是按账户性质再分组）；分类/账户被流水引用时禁用删除，未做「转移后删除」；回滚与清空为演示提示、不写库；回收站无软删除记录故恒为空态；移动端二级页里的行去掉缩进与拖拽占位，把宽度让给名称（302px 下否则只剩「招…」）。顺带修正：预览壳手机框高度以画布为上限（窄视口工具栏换行后手机框上溢，二级页「返回」被工具栏压住）。自查：typecheck 0 错、lint 0 error / 5 既有 warning、test 19 文件 130 用例；实测 console error 0，PC 行高 44px / ⋯ 32px，移动入口 56px / ⋯ 44px / 行 56px |
| HF 设计修订（批次 5 记账浮层） | 2026-11-05 | `/design?page=overview` 的「记一笔」重做为 W1 浮层：五种类型（支出/收入/转账/退款/调整）、四列分类网格（1–9 编号）、账户 chips（当前选中恒在 + 最近使用，行尾「全部账户 ›」开二级抽屉，桌面贴右缘 / 移动贴底）、转账双行账户与手续费、日期/备注折叠「更多」、PC 保存 + 保存并再记（⏎ 进分类、1–9 选分类、⏎ 提交）、移动自绘键盘（40px 高例外、宽度 ≥44）+ 连记计数、关闭带草稿发「已放弃这笔·撤销」。与线框差异：移动类型行画了 5 项（线框只画 3 项，但类型筛选与流水页已统一 5 类）；账户 chips 只保证「选中 + 最近使用」前 5 个，“全部账户”固定钉在行尾不随 chips 横滑；优惠券字段未做（手续费/日期/备注已做）。顺带修正：转账此前只加流水不改双账户余额，补 `balanceDeltas` 双向调整（编辑/删除同样生效）；二级抽屉重新挂到 root/手机框，避免被记账弹层的 transform 困在弹层内；预览壳窄视口隐藏品牌文案与提示，给手机框腾高度。自查：typecheck 0 错、lint 0 error / 5 既有 warning、test 19 文件 133 用例；实测 console error 0，PC 弹层 600×536、金额 40px、类型 32px、分类 44px；移动抽屉 796px、类型 44px、分类 46px、chip 44px、键盘 40px / 107px 宽 |
| HF 修复（1/6 预览壳手机框） | 2026-11-05 | 预览壳手机框改回 **390×844 1:1** 渲染：取消「高度以画布为上限」的压缩，画布改为可滚动（窄窗口优先露出左缘）；移动截图按手机框元素截取，框内正文 28px、金额与轴标签不再被缩成 8px 级。实测 1440×900 与 900×700 两种窗口手机框均为 390×844，工具栏 57 / 87.84px 两行不压页面；console error 0 |
| HF 修复（2/6 预算页 W7） | 2026-11-05 | 新增 `/design?page=budgets`：总预算环（PC 156 / 移动 108）+ 已用/可花、支出 6 条 / 收入 1 条 / 转账 1 条、warning（娱乐 87.8%）与 over（购物 157.1%，超支 ¥457.20）各一行、需要关注分组、上月/本月切换、空态、详情抽屉（按实际调整 / 维持限额 / 查看流水）、新增编辑器。种子把娱乐限额调到 9,000 以补 warning；总额变 73.6%（线框 72% 为示例数据）。差异：查看流水只跳页不带分类筛选、周/季/年预算按所选月份月末结算。四态与双端浅深截图 `.artifacts/hf-fix-budget/`，console error 0 |
| HF 修复（3/6 报表合计行） | 2026-11-05 | 根因：并排两表的静默占位行固定 3 行，不随行数差补齐（实测资产负债 58px、收支 265px、现金流 263px）。改为 `minRows = max(左表行, 右表行)`，占位行数按差值动态补齐；同时把折叠按钮从 22px 收到 20px，消除 2px 行高漂移。实测三视图 tfoot 顶边差 **0 / 0 / 0px**（折叠后仍 0），占位行 29px、`tabindex=-1`、无底色，合计行金额列与数据行右边界同为 809 / 1349px；脚本 `.artifacts/hf-fix-footers/measure-footers.mjs`，console error 0 |
| HF 修复（4/6 投资分析单表） | 2026-11-05 | 投资分析由 4 张 2×2 拆表改为一张「持仓明细」（与 platform 一致）：持仓 / 市值 / 成本 / 收益 / 收益率，父行=账户、子行=资产类别（可折叠），页脚同口径合计；移动端保持表格形态，min-width 640 横向滚动 + 首列 sticky。实测 PC 表宽 1022（286 / 184×4）、移动容器 310 / 表 640，滚动 140px 后首列 left 仍为容器 left 445px，行高 29，折叠 4→1；`ReportTable` 数值列改为按列定义右对齐（修复 5 列表中间三列原本左对齐）。成本按目标配置比例折算，属演示口径、不写回账本。截图 `.artifacts/hf-fix-invest/`，console error 0；typecheck 0 错、lint 0 error / 5 既有 warning、test 20 文件 139 用例 |
| HF 修复（5/6 PC 页头） | 2026-11-05 | 五个页面（总览 / 流水 / 报表 / 预算 / 设置）的 PC 页头由「28px 纵排」改为「20px 标题 + 13px 副文案基线横排」（`--mb-fs-4` + `--mb-s-3`）；移动端沿用 shell 的 `--mb-fs-5`（28px）纵排不变。实测 5 页 PC 标题均 20px、desc 均 13px、`flex-direction: row`、标题/desc 底边差 1.42px（同一基线）；移动 5 页标题均 28px。预算页内层 copy 补 `mb-bg-page-copy` 以保持基线。截图 `.artifacts/hf-fix-head/`，console error 0；typecheck 0 错、lint 0 error / 5 既有 warning、test 20 文件 139 用例 |
| HF 修复（审计④ P2） | 2026-11-05 | ① 设置页禁用原因由 `title` 改为菜单项下方常显 `.mb-set-menu-hint`（12px），菜单宽度放到 200–260；实测菜单提示「分类下仍有账户，先移动或删除账户」12px 可见。② `overlays.css` 分类编号角标 `10px → --mb-fs-0` 并把位置收到 top 1 / right 6，实测 12px 不压分类名；`.mb-detail-code` 两处 `!important` 改为 `.mb-detail-list .mb-detail-code` 提高特异性，字号 13px 保留。③ 流水无匹配态原已有「没有匹配的记录」，按钮文案统一为「清空筛选」，实测过滤后提示可见、清空后 13 笔恢复。④ 撤销 toast 改队列：每条操作独立对象与闭包，最多同时 3 条；撤销改用 `ledgerRef.current`，连删两笔后逐条撤销实测总数 13 → 11 → 12 → 13，两个闭包都有效。截图 `.artifacts/hf-fix-p2/`，console error 0；typecheck 0 错、lint 0 error / 5 既有 warning、test 20 文件 139 用例 |
| HF 修复（审计⑤退款分类） | 2026-11-05 | 退款分类格由单一「退款」改为「通用退款 + 全部支出根分类」共 9 项（仍可用 1–9 编号）；选中支出分类表示冲减该类别，金额仍按收入计、报表「收入构成」按该分类归集。新增回归测试断言退款落 `food` 时 `income=5,200`、`incomeTrees.food=200`、`expenseTrees.food=1,300`。实测 PC / 移动均 9 项、默认「退款」、选「餐饮」高亮，保存 toast 正常。口径写进 [interaction-spec §2.5](ux/interaction-spec.md)。截图 `.artifacts/hf-fix-refund/`，console error 0；typecheck 0 错、lint 0 error / 5 既有 warning、test 20 文件 140 用例 |
| HF 修复（审计⑥文档精简） | 2026-11-05 | 按审计表合并/删除冗余：concept 删模块速览重复的「总览」行、Q1–Q5 与 §8.4 Q 表移入新的 [ux/archive/concept-history.md](ux/archive/concept-history.md)（正文留指针）、间距与触控例外改引用 design-tokens §4/§5 与 platform §7、清掉两处「图高 180px」并把第六轮块序标作废；design-tokens / platform / principles / dev-guide 不再写死主卡暗色色值，统一指向 design-tokens §2.1。仅文档，无代码改动 |
| HF 修复（审计⑦字体统一） | 2026-11-05 | 全库收敛为单一字体栈：`--mb-font-num` / `--mb-font-display` 改为 `var(--mb-font-ui)`，`body` 统一栈并启用 `font-variant-numeric: tabular-nums`（数字与正文同族、金额仍按列对齐）；清掉 AntD `Avenir Next` 字面量与全部 10 / 11px 字号（角标、Tag、图标、移动标签），把 15px→16、18px→20、22px→20、32px→28 改回 token 档；700 字重统一为 600。新增决策 #44，design-tokens §8 更名「字体栈与数字」并补字号/字重档说明，dev-guide 同步。类型/字号/字重回改前→改后对照见交付说明；typecheck 0 错、lint 0 error / 5 既有 warning、test 20 文件 140 用例。**越界回退（补正）**：旧前端已冻结（见「旧前端冻结（legacy）」行），本轮字体统一只保留共享层（`styles/theme/variables.css` 字体 token、`reset.css` 的 `body` 字体栈 + `tabular-nums`、Mantine `theme/config.ts`）；旧 `src/pages`、旧 `src/components`（reports / transactions / budgets / common）与旧 `src/styles/*.css` 里的 10/11px、15→16、18→20、22→20、32→28、700→600 已全部回退，旧页借 token 生效、未改旧页面文件。字号/字重档约束只约束 HF 新壳，旧页保持冻结 |
| HF 修复（审计⑧流水行比对） | 2026-11-05 | 以 `ux/prototype` 的 PC 流水行实测为参照逐项比对并修正：列宽由 34 / 27 / 23 / auto 收敛到权重 2.4 / 1.6 / 1.6 / 1.1（实测 382 / 255 / 255 / 170，总宽 1062）；账户列补单行「账户 · 类型」，对齐原型副行信息；行高维持 spec 的 29px、实线分隔、无行内操作。**线框过时项**：原型行高 54.19px（8px padding + 双行）、分类备注与账户类型各占一行、分隔线为虚线——与 §5.3 固定 29px / 不做行内展开冲突，以 spec 为准。**保留差异**：原型未定义 hover 背景，实现保留整行 hover 反馈；类型筛选项 5 项 vs 线框 3 项（既有差异清单）。截图与实测见 `.artifacts/hf-fix-ledger/` |
| HF 修复（审计⑨线框差异清单） | 2026-11-05 | 逐区块核对结果：页头（PC 20/13 基线横排、移动 shell 28px）已修；工具栏（PC 搜索 + 类型 + 批量 + 显示，移动类型 + 高级筛选 + 批量）与线框位置一致；卡片标题/副文案按线框保留「标题 + 说明」；流水行内元素顺序（图标 / 分类 / 备注 / 账户 · 类型 / 金额）已修；空态与错误态文案 + 按钮已补（「没有匹配的记录」+「清空筛选」）；设置二级页页头为「‹ 返回 + 标题 + 右侧占位」，一级页无返回位。**线框过时（不改结构）**：类型筛选项 5 项 vs 线框 3 项（类型模型为 5 类）；PC 流水双行行高 54px / 虚线分隔（以 §5.3 的 29px、实线为准）；报表投资 4 表 2×2（已按拍板改单表）。**待拍板/保留**：非选中行 hover 背景（原型未定义）；空态插画位（线框为首版占位）；**行高定稿**——流水行保持 §5.3 的 29px 单行；原型 54px 双行标记为线框过时，**不按 54px 改动**。审计原文的「应改实现」逐条表未随消息传入，后续按表续修 |
| HF 复核（②现金流折叠） | 2026-11-05 | 现金流左右两表共用 `foldedCash`，而分组键都是「经营 / 投资 / 筹资」，点左侧流入会把右侧流出一起折掉。键改为 `in:<id>` / `out:<id>`（PC 表格与移动卡片行同规则），符合 interaction-spec「按报表:表名:父项存放」。新增 `tests/unit/reports-fold.test.ts`：只折 `in:经营` 时流入 1 行、流出仍 3 行。typecheck 0 错、该测试 1/1 通过 |
| HF 复核（③冻结层 token） | 2026-11-05 | `--mb-font-size-title` 回 18px（原改 20）、`--mb-font-size-mobile-label` 回 11px（原改 12）——两者仅旧页引用、HF 不用；保留 `reset.css` 的字体栈 + `tabular-nums` 与 Mantine `fontFamily`。design-tokens §8 补注「字号/字重档约束只约束 HF 新壳，旧页冻结不受约束」，避免下次审计误判。CSS 变量守卫 3/3 通过、无死变量 |
| HF 复核（④P3 三项） | 2026-11-05 | ①流水账户副行 `.mb-tx-account-line` 加 `gap: 2px`，账户名与「· 类型」不再贴死；②预算环心改用 `percentText`，环心与副文案均为 `73.6%`（PC 环 156、移动 108）；③报表折叠按钮 22×20 可视，伪元素向右/上/下外扩成 44×44 热区（左侧贴滚动容器不外扩），四向 `elementFromPoint` 均命中，首列文本改内层 ellipsis 以避开 `td` 裁切；`cashRowsFor` 移至 `reportsModel` 避免组件文件导出纯函数触发 lint。实测图 `.artifacts/hf-fix-final/{budget-hero,tx-table,reports-cash}.png`。typecheck 0 错、lint 0 error / 5 既有 warning、test 21 文件 141 用例 |
| HF 修复（①PC 流水行视觉主次） | 2026-11-05 | ①分类名改 `--mb-color-text-primary` + 600（实测改前 rgb(86,90,96)/400 → 改后 rgb(20,22,26)/600）；备注与账户统一 secondary `#565A60`（rgb(86,90,96)，备注不再比分类名重）；②分类图标字形 15 → 18px（容器 20px，受 29px 行高约束上限），图标与文字中心差 0.42px；③金额表头 `th.mb-tx-th-num` 与金额数字统一右对齐、同一右内边距，右端点差 122 → 0（诊断记 158，复测 122）；④表头/行分隔线由实线改 `1px dashed var(--mb-color-border)`（rgb(223,225,221)）；⑤列宽权重 2.0 / 1.9 / 1.8 / 1.1，PC 实测改前 382/255/255/170（36/24/24/16%）→ 改后 312/297/281/172（29.41/27.94/26.47/16.18%），批量模式复选框列 44px 先从容器宽度扣除；总览「最近交易」同一套权重 170/162/153/94px，表宽 = 容器宽 578、无横向溢出。同步 interaction-spec §5.3（权重数字 + 「流水表允许表头，金额列右对齐」）与 design-tokens §5。截图 `.artifacts/hf-fix-visual/{tx-before,tx-after,overview-recent}.png`；typecheck 0 错、lint 0 error / 5 既有 warning、test 21 文件 141 用例 |
| HF 修复（②组件对齐与空缺） | 2026-11-05 | ①总览「最近交易」加 `align-self:start`：卡高 397 → 327，最后一行到卡底 142 → 72（其中 38px 为「查看全部流水」页脚），表尾到页脚空隙 83 → 13（≤16）；②报表两卡 `align-items:stretch` + `.mb-rp-chart-card` 纵向 flex + 资产构成图例 `flex:1/space-between`：卡高改前 201 vs 294、底边差 92 → 改后 294/294、底边差 0（≤4）；③「需要关注」改单列：桌面实测改前两列 503/503，左列少一条留 44px 内空槽 → 改后单列 1022px、内空槽 0；移动端本就是单列（内空槽 0），删除冗余的移动双列覆盖；④流水工具栏按钮统一 `min-width: calc(var(--mb-touch) * 2 + var(--mb-s-2))`（96px）：97/52/52 → 97/96/96，参差 45 → 1（高级筛选含图标的自然宽），未加图标；⑤报表 `is-c3` 列宽随新权重收为 40.82/36.73/22.45，实测改前 222/135/125（46/28/26）→ 改后 197/177/108。截图与实测 `.artifacts/hf-fix-components/`（before/after JSON + 各页 PNG）。typecheck 0 错、lint 0 error / 5 既有 warning、test 21 文件 141 用例 |
| HF 修复（③预算进度条颜色与 100% 口径） | 2026-11-05 | ①轨道由 `surface-sunken` #EDEDEA（实测 rgb(237,237,234)，对白 1.17:1）改 `--mb-color-border-strong` #CBCEC8（rgb(203,206,200)，1.55:1），加 1px `--mb-color-border` 描边（rgb(223,225,221)），预算页与总览预算卡同步；②normal 行状态文字 rgb(86,90,96) → accent rgb(53,107,12)；warning/over/achieved 的填充与文字同色关系不变（居住 100% 仍「已达上限」rgb(138,90,0)）；③转账类（账户互转 5,000/5,000）由 normal/满格绿/「剩余 ¥0.00」改为 neutral/「不计入预算」/`progress.value=0`（轨道可见、无填充），新增 neutral 级与 `data-level='neutral'` 样式；同步 interaction-spec §6.1/§6.2/§6.3 与预算页说明文案，单测转账断言改 neutral。截图 `.artifacts/hf-fix-budget/{budget-before,budget-after,transfer-before,transfer-after,overview-budget-before,overview-budget-after}.png` + measure.json；typecheck 0 错、lint 0 error / 5 既有 warning、test 21 文件 141 用例 |
| HF 修复（①批量列宽 calc 失效） | 2026-11-05 | `table-layout: fixed` 下 Chromium 对 `calc()` 列宽回退等分：批量态实测 1440 为 254.5×4、1280 为 235.5×4；改纯百分比 29.41 / 27.94 / 26.47 / 16.18 + 固定复选框列 44px，实测 1440 为 299.4 / 284.4 / 269.5 / 164.7、1280 为 277 / 263.2 / 249.3 / 152.4；`scrollWidth = clientWidth`（1062 / 986），末列与表右缘差 0。删除不再使用的 `--mb-tx-check-w`，design-tokens §5 改为「复选框列固定 44px，百分比列由浏览器按剩余宽度折算」。截图 `.artifacts/hf-fix-batchwidth/{batch-1440-after,batch-1280-after,batch-1440-before,batch-1280-before}.png` + measure.json；typecheck 0 错、lint 0 error / 5 既有 warning、test 21 文件 141 用例 |
| HF 修复（②总览预算条 token 统一） | 2026-11-05 | 填充色像素采样：normal rgb(163,230,53) `accent-fill` → rgb(53,107,12) `--mb-color-accent`；over rgb(182,91,98) `expense-display` → rgb(166,77,86) `--mb-color-expense`；`::-moz-progress-bar` 两处同步，与预算页一致，未动其他样式。截图 `.artifacts/hf-fix-overview-bar/{normal-before,normal-after,over-before,over-after,overview-before,overview-after}.png`；typecheck 0 错、lint 0 error / 5 既有 warning、test 21 文件 141 用例 |
| HF 修复（③总览最近交易行内主次） | 2026-11-05 | 桌面行三类文字由统一的 rgb(20,22,26)/400 改为与流水同语义：分类名 `primary` rgb(20,22,26)/600，备注与账户 `secondary` rgb(86,90,96)/400；账户列补「· 类型」标签（tertiary rgb(99,104,110)/12px，`flex:none` 不参与截断），29px 行高不变；移动端 meta 由「分类 · 账户」改为「分类 · 账户 · 类型」。未选择「有意差异」的另一条路，总览摘要卡与流水同一套主次。截图 `.artifacts/hf-fix-recent/{desktop-before,desktop-after,mobile-before,mobile-after}.png`；typecheck 0 错、lint 0 error / 5 既有 warning、test 21 文件 141 用例 |
| HF 修复（④PC 流水行结构重做） | 2026-11-05 | 推翻流水表格结构：删除 `thead` / `colgroup` / 四列，改为原型两段式行——主行「26px 分类图标 + 分类名 `primary/600` + `·` + 备注 `secondary`」，副行「账户 · 类型」12px `secondary`，行尾右对齐金额；行高实测 54.0px（新增 `--mb-tx-row-h`），无表头，行间 `1px dashed rgb(223,225,221)`（新增 `--mb-border-style-dashed`）；分类名 rgb(20,22,26)/600、备注与账户 rgb(86,90,96)/400、金额 rgb(166,77,86)/14px、金额右缘距卡右 13px；批量态行宽 1062、`scrollWidth = clientWidth`，无横向溢出（原 calc 列宽规则随结构一并删除）；移动端行高 69 未受影响。**29px 判断撤回、54px 两段式为定稿**：`--mb-tbl-row-h` 适用范围收敛为报表数据表，interaction-spec §5.3 第 6 条标注作废并写明原因，design-tokens §5 同步。截图 `.artifacts/hf-tx-restructure/{desktop-after,desktop-batch-after,mobile-after}.png`；typecheck 0 错、lint 0 error / 5 既有 warning、test 21 文件 141 用例 |
| HF 修复（⑤进度条面 / 字分离） | 2026-11-05 | 新增填充专用 token `--mb-progress-normal / -warning / -over / -achieved`（浅 `#4B7326/#7D5200/#93414A/#17603A`，暗 `#7FA84A/#D9A64B/#E08A90/#45B37A`），条面不再引用 `accent` / `expense` 等文字色；轨道 `border-strong`、条高 6px、去掉 1px 描边；预算页列表、详情抽屉、总览预算卡共用 `features/shared/BudgetProgress`（0–130% 刻度，100% 预算位 76.92%，右侧 30% 溢出区，超支第二段由刻度处长出）。文字回到文字体系：名称恒 `primary`，normal/achieved/neutral 状态文字 `secondary`，仅 warning/over 用语义色并带 `TriangleAlert`。实测填充对轨道：浅色 3.49 / 4.29 / 4.26 / 4.76，暗色 4.18 / 5.23 / 4.52 / 4.39（均 ≥3:1）；条高 6.00px；100% 行 fill 76.9%、over 157.1% 行 fill 76.9% + 溢出段。截图 `.artifacts/hf-progress/{light,dark}-budget-group1.png`、`{light,dark}-row-{normal,warning,over,achieved}.png`、`{light,dark}-overview-card.png`；typecheck 0 错、lint 0 error / 5 既有 warning、test 21 文件 141 用例 |
| HF 修复（⑥文档收尾 P3） | 2026-11-05 | concept-design 移动预算线框环形「150px」→「108px」，与同节 L796 的 108px 口径一致（两处矛盾消除）；新增 `--mb-border-style-dashed: dashed`，流水分隔线由裸关键字改为 `var(--mb-border-style-dashed)`，旧冻结层 `styles/components/picker.css` 与旧 `components/reports/PredictionPopover.tsx` 不动。纯文档 / token 变更，无页面截图；`grep dashed` 结果仅剩冻结层与图表库字面量 |
| 桌面壳 | 2026-11-05 | `275e3d8` / `0734666`：本机无 `rustc`/`cargo`，Tauri 不可用，降级为 `npm run desktop`（打包产物 + `vite preview` + API 服务 + Edge `--app` 窗口 1280×820）；`scripts/desktop-smoke.mjs` 经 CDP 驱动真实窗口实跑「记账 → 总览 → 流水 → 报表」四步截图取证。安装包仍缺（需 Rust 工具链），**不得声称已打包** |
| W1 收尾 | 2026-11-05 | `9d83e43`：草稿丢弃可撤销（快照含连记计数）、PC 记账头「已连记 N 笔」、`N`/`1–5`/`/` 热键进生产壳、流水「显示」面板（账户/类型/备注列显隐 + 标准/紧凑密度，`localStorage` 持久化，PC 原地面板与移动底部抽屉共用渲染器） |
| R1 | 2026-11-05 | **提前落地、待 HF 确认后定稿**（`8af8bb6` / `8b4f3ab`）：`/dashboard`、`/transactions`、`/reports` 渲染 HF 页面并接现有 API 查询/写入；旧 AntD 页面原样挂到 `/legacy/*`（预算/设置入口暂指向旧版）；`/design` 保留 mock 预览；新增 `e2e/tests/prod-loop.spec.ts` 覆盖冷启动记账闭环。生产报表只开放收支明细 / 资产负债两视图，现金流与投资分析仍为 `/design` 预览（`views={['flows','balance']}`），待 R 批接真实 API |
| R1 收尾（夜间） | 2026-11-05 | `f887e0d` · 19 条红 e2e 清零（9 条按 ProdShell 结构重写、7 条设置/主题用例按现状改写、3 条已废弃功能删除），全量 28 条通过；桌面首启补端口占用提示、重复启动聚焦已有窗口、最小窗口尺寸、dist/DB 缺失提示与退出清理；烟测改自建临时 SQLite 库并对比真实账本笔数（零写入）；生产报表 `asOf` 未来时点收敛到当天（两视图取舍保持不变）；`test:web` 实测 25 文件 166 用例 |
| 桌面分发收口（夜间第 5 轮） | 2026-11-05 | `778fbd8` · e2e 改为 `%TEMP%` 临时库（API 包装建库、teardown 先停进程树再删库），全量 28 条通过且真实账本 1→1；全新 profile 加 `--disable-sync` + CDP 兜底关弹窗，首启仅应用窗口；启动器补缺失产物自动构建、dev.db 自动迁移、单实例路径最小 1024×640、关窗等待 3001/4173/9333 释放；新增 `desktop:open` 与 `MoneyBrain.cmd`，「关于」显示版本 1.0.0；README 如实记录 Edge `--app` 形态与无签名 / 无自动更新 / 无 Tauri 安装包限制 |
| 旧前端冻结（legacy） | 2026-11-05 | `afbc0c4` · 回退后旧前端原位冻结：`apps/web/src/pages`、`layouts`、旧 `components` 不迁移、不改写、R2 前不再新增代码；R2a/R2b/R2c 每屏落地时同一提交删除对应旧页；回退单位按屏 `git revert`，不保留 `/old` 路由或开关 |
| 稳健性收口（夜间第 6 轮） | 2026-11-05 | `7273d8a` · e2e 临时库改为 `%TEMP%\moneybrain-e2e-<PID>`（owner.pid 判活、teardown 只删自己；3001/3002 均不再复用已有服务），全量 28 条通过且真实账本 1→1，并发两实例实测各建各库、B 退出不影响 A；桌面启动器加锁文件互斥，快速双击第二次 2.1s 内明确退出（启动中报错码 1、已有窗口 0.1s 聚焦码 0），窗口交由已有 Edge 进程后关窗自动停服并在 7.4s 释放 3001/4173/9333；`MoneyBrain.cmd` 补 Node ≥20 版本校验；任务栏图标仅确认 `favicon.svg` 静态链路，**未做视觉截图验证** |
