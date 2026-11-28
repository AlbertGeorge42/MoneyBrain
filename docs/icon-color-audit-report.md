# 图标与图标颜色系统审计报告

> 审计日期：2026-11-28　｜　范围：账户/分类/交易图标、图标颜色、用户可配置边界、跨页面一致性
> 性质：**审计与方案设计**（审计当下未改代码）。所有结论均标注源码位置，可逐条核对。
> 图标库：`lucide-react ^0.577.0`（`apps/web/package.json:24`），本次不建议引入任何新图标库/动画库。
>
> **实施状态更新（2026-11-28）**：决策点 1 已拍板为「账户支持图标自定义」，并已完成实现——
> `Account` 全链路新增 `iconKey`（Prisma schema + 迁移 `20261128100000_add_account_icon_key` + 契约 +
> API 读写校验 + 配置导入导出 + 前端编辑/选择/展示），账户未设图标时回退所属分组图标（P0-2 的两页视觉语言差异
> 在设置页已消除；总览页首字圆点为紧凑身份标识，非列表图标，暂保留）。本报告其余结论与问题清单仍为审计时快照，未实施。

---

## 〇、执行摘要（先看结论）

系统整体健康度不错的三件事：**颜色 token 只有一份**（`theme-tokens.ts`）、**图标注册表只有一份**（`categoryIcons.ts`）、**用户分类图标全部走 `currentColor` + tone class**，没有 feature 私搭颜色体系。真正需要处理的不是"颜色太多"，而是**三类边界没接上**：

| 关键结论 | 一句话 |
|---|---|
| P0-1 | 「自动（按名称匹配）」是**承诺了不存在的功能**——UI 四处这么写，实现只做 key 查表，未命中直接回退通用 Tag。 |
| P0-2 | **账户对象根本不支持图标自定义**（`Account` 无 `iconKey` 字段），与任务假设的"账户可选图标"不符，需先澄清边界。 |
| P0-3 | 退款/平账/活动的**专用语义色与 Badge tone 已定义但零调用**，退款实际显示收入绿、平账显示方向色，语义色形同虚设。 |
| P1 | 同一分类图标跨页出现 **15/18px 两种尺寸 + 20/24/26/44px 四种容器 + 彩色/中性/无三种颜色**。 |
| P1 | `warning` 状态色被当成业务色用在「不计收支」「退款全额」上。 |
| P1 | 固定现金流分组图标**只在设置页出现**，报表与 Sankey 只上色不显图标。 |
| 好消息 | 一级/二级分类图标**尺寸颜色完全一致、靠字重区分层级**——这一点已经符合任务期望，不用推倒重来。 |

---

## A. 当前系统现状

### A.1 完整图标使用清单

| 对象 | 层级 | 业务含义 | 当前图标 | 当前颜色 | 配置方式 | 使用位置（证据） |
|---|---|---|---|---|---|---|
| 账户分类 | 一级 | 账户分组（资产/负债） | 用户选 key，60 选 1；未选回退 `Tag` | 图标 key 注册 tone `cat-1..cat-6` | 用户设置 | `AccountsSection.tsx:250-252`、`categoryIcons.ts:116-188` |
| 账户 | 具体账户 | 单个账户 | **无可配图标**：总览=首字圆点；设置页=固定 `Wallet` | 圆点=`stableSlotMap` 稳定 cat 色；Wallet=中性 | **不可配置** | `AccountEntry.tsx:52-59`、`AccountsSection.tsx:135-137`；契约 `contracts/types/index.ts:142-157` 与数据库 `schema.prisma:34-58` **均无 iconKey**（迁移 `20261108100000_add_category_icon_key` 也只给两张分类表加列） |
| 收支一级分类 | 一级 | 收入/支出根分类 | 用户选 key；未选回退 `Tag` | 注册 tone `cat-1..cat-6` | 用户设置 | `CategoriesSection.tsx:143-145` |
| 收支二级分类 | 二级 | 子分类 | 自身未设则**继承父级** iconKey | 同父级 tone | 用户设置（继承） | `getCategoryIconKey` `model.ts:619-628`、`CategoriesSection.tsx:121-122` |
| 现金流资产分类 | 一级（固定） | 现金/投资/其他资产 | `Wallet` / `TrendingUp` / `Boxes` | 设置页中性，无专属色 | **系统固定** | `CashflowSection.tsx:42-45` `ASSET_MARK_ICONS` |
| 收入/支出活动分类 | 一级（固定） | 经营/投资/筹资/未分配 | `BriefcaseBusiness` / `TrendingUp` / `Landmark` / `CircleHelp` | 活动色 `--mb-color-activity-*` | **系统固定** | `CashflowSection.tsx:47-52` `ACTIVITY_ICONS`、`theme-tokens.ts:216-224` |
| 转账系统分类 | 二级（固定） | 转账/买入/卖出/还款/借贷 | 无专属图标 | 无 | **系统固定** | `domain/transfer-classify.ts:10-26` |
| 退款 | 交易类型 | 退款交易 | **无独立图标**，继承原交易分类图标 | Badge 用 `income` 绿；另有 `refund` 青色 token 未用 | 系统固定 | `model.ts:644`、`TransactionDetailPanel.tsx:309-311`、`TxRow.tsx:71` |
| 平账 | 交易类型 | 余额调整 | **无独立图标**，走分类图标 | Badge 按金额正负取 income/expense；另有 `reconciliation` 灰 token 未用 | 系统固定 | `model.ts:646`、`filters.ts:78`、`cashSankeyModel.ts:880-913` |

### A.2 图标映射关系

**用户可选图标库**：`packages/contracts/constants.ts:42-114` 定义 60 个受控 key，与 `apps/web/src/features/overview/categoryIcons.ts:116-188` 的 60 条注册表**一一对应、顺序一致**；11 个语义分组（餐饮/交通/购物/居住/娱乐/医疗/教育/收入/转账金融/账户类/其他，`categoryIcons.ts:96-108`）。允许写入的 key 由 `isCategoryIconKey()`（`constants.ts:118-120`）在 API 边界收口。

**解析链**：`getCategoryIconKey(ledger, categoryId)`（自身→父链向上找最近 iconKey，`model.ts:619-628`）→ `resolveCategoryIcon(iconKey)`（key→registry 查表，未命中回退 `Tag`/`cat-6`，`categoryIcons.ts:218-226`）→ `CategoryIcon` 渲染（`category.tsx:10-14`）。

**系统固定图标**是**另一套、各自维护**：`CashflowSection.tsx` 的两个本地 `Record`（`:42-53`），注释明确"固定一级分组不像账本分类那样有 iconKey"。**交易类型到图标没有映射函数**——全局搜索 `transactionIcon/typeIcon` 无结果，只有 `transactionTone`（方向色）和 `transactionDirection`（文案，`model.ts:643-663`）。

### A.3 颜色映射关系（唯一源 `theme-tokens.ts`，浅深两套）

| 语义 | 变量 | 浅色 | 深色 | 消费点 |
|---|---|---|---|---|
| 收入 | `--mb-color-income` | `#1b7a48` | `#4ade80` | 金额/进度/报表 |
| 支出 | `--mb-color-expense` | `#a64d56` | `#f0a4ab` | 同上 |
| 转账 | `--mb-color-transfer` | `#1d6d8e` | `#4c9fc4` | 金额/Badge/Sankey |
| 退款 | `--mb-color-refund` | `#0f766e` | `#4fd1c5` | **仅定义，零调用** |
| 平账 | `--mb-color-reconciliation` | `#5f6366` | `#a6acb2` | **仅定义，零调用** |
| 活动-经营/投资/筹资 | `--mb-color-activity-*` | `#7a9014/#5888e2/#ab7acd` | `#a4bc4d/#82adfe/#d29df2` | Sankey、Badge(未用) |
| 分类图标色 | `--mb-color-cat-1..6` | 绿/青/蓝/紫/粉/橙 | 提亮重排 | 图标 tone class |
| 图表序列色 | `--mb-chart-series-1..10` | 10 色 | 10 色 | **只用于图表填充，不用于图标**（注释 `theme-tokens.ts:191-193`） |

- 图标上色统一走 `currentColor`：lucide 图标无 color prop，父 `<span class="mb-shared-icon mb-tone-cat-N">` 用 CSS `color` + `color-mix` 背景（`overview.css:379-407`）。
- **硬编码颜色仅 2 处**：`DonutChart.tsx:288` 与 `:380` 的 `rgba(255,255,255,0.62)` 斜纹，非业务色值。
- `variables.css` 开头明确声明颜色由 `theme-tokens.ts` 输出，自身只放结构 token——**没有第二套颜色体系**。

### A.4 用户可设置 vs 系统固定的边界

| 边界 | 现状 | 是否清晰 |
|---|---|---|
| 账户分类 / 收支分类（一二级） | 用户可选 60 key，空=自动 | ✅ 清晰 |
| **账户** | 无 iconKey，不可配 | ⚠️ 与任务假设冲突，需确认 |
| 现金流资产/活动分组 | 系统固定图标、无 iconKey，不进选择器 | ✅ 代码上清晰，但与用户分类**图标语言不统一**（见 P1-3） |
| 退款/平账 | 系统固定语义，但**复用了用户分类图标位** | ❌ 边界模糊 |
| 图标颜色 | 用户**不可**自定义颜色，只有图标 key | ✅ 符合"不随意加配置项"约束 |

### A.5 浅色 / 深色模式表现

- 唯一来源为 Mantine `colorScheme`（light/dark/auto，`main.tsx:35-49`），`cssVariablesResolver` 输出全部 `--mb-*`。
- 浅深两套 token 完整覆盖业务色/活动色/中性色/状态色，深色基本为提亮处理。
- 图标走 `currentColor` + `color-mix(...surface-raised)`，**深色下自动适配**，无需单独写深色图标色。
- 唯一与主题无关的字面量是 DonutChart 的白色斜纹（深色下仍是白斜纹，程度较轻，见 P3-1）。

---

## B. 问题清单（按严重程度，均附代码证据）

### P0 — 语义错误 / 业务混淆 / 明显功能问题

**P0-1　「自动（按名称匹配）」是承诺了不存在的功能**
- 证据：UI 与注释四处承诺按名称匹配——`EditorSheet.tsx:279`「自动（按名称匹配）」、`:284`「选自动时按分类名称匹配」、`IconPickerSheet.tsx:129` 同文案、`model.ts:617`「回退到名称映射 / 通用 Tag」、`constants.ts:35`「回退到按分类名映射的既有图标」、`ledgerStore.ts:60`。
- 实际：`resolveCategoryIcon`（`categoryIcons.ts:218-226`）只做 `iconKey → registry` 查表，未命中**直接回退 `Tag`/`cat-6`**，全仓无任何名称→图标映射实现。
- 影响：用户选「自动」后，无论分类叫"餐饮"还是"工资"，看到的都是同一个灰色标签，与承诺严重不符。这是**功能缺失**，不是审美问题。

**P0-2　账户对象不支持图标自定义，且两页两套视觉语言**
- 证据（全链路三层都无）：数据库 `Account` 表无 `iconKey`（`apps/api/prisma/schema.prisma:34-58`，对比有该字段的 `AccountCategory:23`、`TransactionCategory:65`；迁移 `20261108100000_add_category_icon_key/migration.sql` 也只给两张分类表加列）；API 契约 `Account` 接口无该字段（`contracts/types/index.ts:142-157`）；`EditorSheet.tsx:191-194` 只对 `category`/`accountGroup` 保存 iconKey。
- 若要支持账户图标，需改数据模型：Prisma schema + 新迁移 + 契约 + API 序列化 + 导入导出 + 同步容器实体，成本远高于分类图标，属独立立项。
- 总览页账户用**首字圆点+稳定 cat 色**（`AccountEntry.tsx:52-58`、`overview.css:291-302`）；设置页账户用**固定 16px 中性 `Wallet`**（`AccountsSection.tsx:135-137`）；同一层级树里，账户分组却是彩色 `CategoryIcon`（`:250-252`）。
- 影响：任务把"账户"列为用户可选图标对象，与实现不符；需要先决定是**明确账户不可配并统一展示**，还是**新增字段**（后者改数据模型，须单独立项）。

**P0-3　退款/平账/活动的专用语义色与 Badge tone 已定义但零调用**
- 证据：token `theme-tokens.ts:167-170,279-282`；`Badge.tsx:11-16` 定义 `refund|reconciliation|activity-*`；`badge.css:38-63` 有样式。全仓搜索 **无任何 `tone="refund"` / `"reconciliation"` / `"activity-*"` 调用**。
- 实际：退款经 `transactionTone`（`model.ts:644`）归为 `income`，Badge 显示**收入绿**；平账按金额正负取 income/expense（`:646`）；只有转账/收入/支出三色真正生效。
- 影响：退款在 Badge 上与普通收入**无法区分**，"退款"文案配绿色底甚至互相矛盾；一整套语义色是死代码。

### P1 — 跨页面不一致 / 颜色冲突 / 明显视觉问题

**P1-1　同一分类图标跨页 2 种尺寸 + 4 种容器 + 3 种颜色语义**

| 场景 | SVG 尺寸 | 容器 | 颜色 | 证据 |
|---|---|---|---|---|
| 设置页分类/账户分组列表 | 15px | 24×24/6px | cat 彩色 | `CategoriesSection.tsx:144`、`settings.css:247-263` |
| TxRow PC | 15px | 26×26 | cat 彩色 | `TxRow.tsx:71`、`txRow.css:64-67` |
| TxRow 移动 | 18px | 26×26（被覆盖） | cat 彩色 | 同上 |
| 交易详情 / 批量改分类 | 15px | 20×20/6px | cat 彩色 | `TransactionDetailPanel.tsx:321`、`BatchDialogs.tsx:98` |
| 编辑预览 | 18px | 44×44/10px | **中性**（tone 被丢弃） | `EditorSheet.tsx:276` |
| 图标选择器网格 | 18px | 44×44 按钮 | **中性**（选中=accent） | `IconPickerSheet.tsx:65,107` |
| 记一笔分类按钮 / 报表表 / Sankey | 无图标 | — | — | `QuickEntry.tsx:447-457`、`ReportTable.tsx:168-197`、`CashSankey.tsx` |

　根因：`CategoryIcon` 声明 `sm/md/row` 三变体（`category.tsx:8`），`row` 是死代码（无 CSS、无调用）；`md` 的 44px 容器在 TxRow 内被更高特异性覆盖为 26px。

**P1-2　`warning` 状态色被当业务色用**
- 证据：「不计收支」Badge `badge.css:32-35`（`TransactionDetailPanel.tsx:361`）；退款「全额」标签 `refund.css:21-23`、`txRow.css:173-175`；排除行左边框 `txRow.css:191-197`、`transactions.css:147`。
- 影响：警告色表达的是业务属性而非异常状态；与已存在的 `--mb-color-refund`（青）并存，口径分裂。

**P1-3　固定现金流分组图标只在设置页出现，报表/Sankey 只上色不显图标**
- 证据：设置页 `CashflowSection.tsx:42-53,162-177,233-246`；现金流量表 `CashView.tsx:116-133` 与收支报表 `FlowView.tsx` 行数据无 icon 字段（`reportsModel.ts:400-466`、`reportRows.ts:29-59`）；Sankey 节点是 `<rect>`、带是 `<path>`（`CashSankey.tsx:502-553`），只有 `toneOf()` 取色（`:101-107`）。
- 影响：同一固定类别在"设置"有图标、在"报表"只有色块，视觉语言不一致；Sankey 的色（activity 色）与 cat 色是两套。

**P1-4　平账文案三处不一致**
- 「平账」（详情方向 `model.ts:660-661`、快捷入口 `QuickEntry.tsx:19-32`）／「调整」（筛选器 `filters.ts:78`）／「对账修正」（Sankey `cashSankeyModel.ts:880-913`）。

**P1-5　编辑预览与图标选择器丢弃 tone**
- `resolveCategoryIcon()` 返回 `{icon, tone}`，但 `EditorSheet.tsx:221-276`、`IconPickerSheet.tsx:50-66` 只用 icon、不用 tone，显示中性色；同一 key 在列表中却是 cat 彩色。

### P2 — 图标选择器体验 / 图标风格 / 视觉细节

- **P2-1　图标语义重叠**：`TrendingUp` 同时表示"投资资产"（`ASSET_MARK_ICONS`）、"投资活动"（`ACTIVITY_ICONS`）、"理财 inv" 与相关账户 key（`categoryIcons.ts:179`）；`Landmark` 同时表示"银行卡 bank" 与"筹资 financing"；`RotateCcw` 既是退款分类 key（`:168`）又是"记一笔退款"操作按钮（`TransactionDetailPanel.tsx:288`），系统固定语义与用户可选图标共用同一图形。
- **P2-2　无图标回退不一致**：`CategoriesSection.tsx:144` 直接 `<Tag size={16}/>`（16px、无 tone、无彩色容器），而 `CategoryIcon` 传空值回退 `Tag` 15px + `cat-6` + 20px 彩色容器（`categoryIcons.ts:222-225`）。
- **P2-3　对齐口径四种并存**：`align-items:center`（`txRow.css:30-33`、`settings.css:163-167`）／`baseline`（详情 `transactions.css:672-676`）／报表首列 center+gap2px（`reports.css:354-359`）。详情父级 baseline 内嵌居中图标，基线与图标中心混排。
- **P2-4　箭头尺寸 18/16/14 三种**：总览 `AccountEntry.tsx:61`（18）、设置树 `AccountsSection.tsx:244`（16）、报表折叠 `ReportTable.tsx:182`（14）；转账箭头是字符 `→`（`TxRow.tsx:98-100`）。
- **P2-5　层级表达四套口径**：设置页字重 600/400（`settings.css:177-184`）／报表缩进+`text-secondary`（`reports.css:297-306`）／编辑下拉 `· ` 前缀（`TransactionDetailPanel.tsx:493`）／记一笔不展示二级（`QuickEntry.tsx:36-47`）。**没有任何一处用图标尺寸区分层级**——建议保持现状并统一为字重，勿新增尺寸差。

### P3 — 可选优化

- **P3-1**　`DonutChart.tsx:288,380` 两处 `rgba(255,255,255,0.62)` 硬编码斜纹，未走 token，深色下同为白斜纹。
- **P3-2**　`Badge` 无 icon 插槽（`Badge.tsx:29-40`），退款关联标签为纯文字 span（`RefundTag.tsx:16-61`）。
- **P3-3**　选择器无「最近使用」、无颜色选择——当前不支持用户自定义颜色，符合"不随意加配置项"约束，**暂不建议开放**。

---

## C. 推荐设计方案

### C.0 三条顶层原则
1. **颜色只表达"这是什么业务类型"，不表达"它是哪类对象"**。对象身份靠图标形状，不靠专属颜色。
2. **一层来源**：图标定义→`categoryIcons.ts`；语义映射→新增一份薄映射（见 C.4）；颜色→`theme-tokens.ts`；展示→共享组件。不新增第二套颜色。
3. **不开放颜色自定义、不新增图标库**、不为每个对象单独建库。

### C.1 对象 → 图标映射（推荐）

| 对象 | 推荐图标 | 说明 |
|---|---|---|
| 账户分类 | 保持用户可配（60 key），未选回退 `Tag` | 不变；补足 C.2 的名称匹配 |
| **账户** | 明确**不可配**，统一为 `CategoryIcon`（继承所属分组图标）或保留首字圆点，二选一 | 消除两页两套语言；**不改数据模型** |
| 收支一级/二级 | 保持用户可配，二级继承父级 | 不变 |
| 现金流资产分类 | `Wallet` / `TrendingUp` / `Boxes` | 图标保留，但**移入统一注册表**（见 C.4），仅固定不可选 |
| 现金流活动分类 | `BriefcaseBusiness` / `TrendingUp` / `Landmark` / `CircleHelp` | 同上；把 `TrendingUp` 与用户"理财"视觉撞车问题按 C.2 处理 |
| 退款 | **新增语义图标 `RotateCcw` + 专用 tone `refund`** | 与分类图标的 `refund` key **共用基础图形但语义不同**：交易类型层用 `refund` 色，分类层用 cat 色，靠颜色区分边界 |
| 平账 | **新增语义图标 `SlidersHorizontal`（或 `Scale`）+ 专用 tone `reconciliation`** | 独立语义，区别于转账 `ArrowLeftRight` |

### C.2 图标选择器规范
- 保留 60 图标 / 11 分组 / 搜索 / 推荐分组，**不新增颜色选择、不新增 HEX**。
- **实现 C.1 承诺的"自动"**：在 `categoryIcons.ts` 增加一张 `名称/关键词 → iconKey` 的映射（复用现有 `keywords` 字段即可，无需新增数据），让 `resolveCategoryIcon(key, name?)` 在未设置 key 时按名称命中；命中则用对应 tone，未命中才回退 `Tag`。**同步修正四处文案**，让文案与实现一致。
- 推荐分组：账户分组→`account`、收入分类→`income`（现有逻辑 `EditorSheet.tsx:212-219` 保留）；支出分类可增加推荐 `food/traffic/shop/home`。
- 「最近使用」为 P3，暂不做。

### C.3 图标颜色 / 层级规范

| 维度 | 规范 |
|---|---|
| 业务类型色 | 金额、Badge、图表一律用 income/expense/transfer/**refund**/**reconciliation** 语义色；**退款/平账改用专用 token**（接上 P0-3 的死代码） |
| 对象属性色 | 分类图标用注册 tone `cat-1..6`；**不为对象类型新增颜色**；图表身份色继续用 `stableColorMap`，与 cat 色是两套，互不混用 |
| 状态色 | `warning` 只用于真实警告；「不计收支」「退款全额」改用中性/专用业务色，与 P1-2 解耦 |
| 用户颜色 | 不开放。若未来开放，只给有限预设，且不得覆盖业务类型色 |
| 层级 | **一级/二级图标同尺寸、同对齐、同色**，仅靠字重 600/400（现状已符合，保持）；二级继承父图标 |
| 暗色 | 图标继续 `currentColor` + `color-mix(surface-raised)`；仅清理 DonutChart 硬编码 |

### C.4 展示组件规范（统一尺寸/容器）
- 给 `CategoryIcon` 的 `size` 定为两档并**落 CSS**：`list`（SVG 16px / 容器 24×24 / 圆角 6px，用于所有列表与 TxRow）、`detail`（SVG 20px / 容器 32×32 / 圆角 8px，用于详情与选择器预览）；**删除 `row` 死代码**。
- 所有使用点统一走该组件，禁止 feature 内 `<XxxIcon size={...}/>` 自定尺寸；`TxRow` 不再覆盖容器尺寸。
- 删除 `CategoriesSection.tsx:144` 的裸 `<Tag/>` 分支，统一走 `CategoryIcon iconKey={null}`。
- 对齐统一 `align-items:center`；箭头统一 16px；转账箭头由字符 `→` 换成 `ArrowRight` 图标（复用 lucide，不新增库）。
- 报表/Sankey 是否显示分类图标：建议**不显示**（保持表格轻量），但需在 C.5 统一"图表用色块、列表用图标"的两套约定并在文档写明，避免被误认为不一致。

### C.5 系统固定图标与用户图标的边界
- 在 `categoryIcons.ts` 增加一组**固定的语义映射常量**（如 `FIXED_CASHFLOW_ICONS`、`TX_TYPE_ICONS`），引用同一批 lucide 组件，**不进 `CATEGORY_ICON_KEYS`、不进选择器**。
- 交易类型 → 图标映射函数 `transactionIcon(tx)`（当前完全缺失）：refund→`RotateCcw`+refund 色，adjustment→`Scale`+reconciliation 色，transfer→`ArrowLeftRight`+transfer 色。给 `Badge` 增加 icon 插槽以配套。

### C.6 浅色/深色与跨页一致性
- 颜色、图标令牌只从 `theme-tokens.ts` / `categoryIcons.ts` 取；新增语义映射不许写死 HEX。
- 统一验收口径：同一 iconKey 在【设置列表、流水行、详情、批量弹窗】四处**尺寸/颜色/对齐完全一致**；报表与 Sankey 按 C.4 约定用色块。

---

## D. 新旧方案对照

| 对象 | 当前方案 | 推荐方案 | 修改原因 |
|---|---|---|---|
| 「自动」图标 | 文案称按名称匹配，实际回退灰色 Tag | 用 `keywords` 做名称匹配，命中则按 key+tone 显示 | P0-1 消除虚假承诺 |
| 账户 | 总览首字圆点／设置固定 Wallet，不可配 | 明确不可配，统一展示语言 | P0-2 消除两页不一致 |
| 退款 | 继承原分类图标，Badge 收入绿 | `RotateCcw` + `refund` 青色 | P0-3 独立语义，接入死代码 |
| 平账 | 无独立图标，按金额正负取色 | `Scale` + `reconciliation` 灰 | P0-3 与普通收支区分 |
| 固定现金流分组 | 设置页有图标、报表无图标 | 图标进统一语义映射；报表约定用色块 | P1-3 明确边界 |
| 不计收支/退款全额 | `warning` 警告色 | 中性/专用业务色 | P1-2 状态色与业务色分离 |
| 分类图标尺寸 | 15/18px + 20/24/26/44px 容器 | `list`=24×24 / `detail`=32×32 两档 | P1-1 跨页一致 |
| 层级表达 | 字重/缩进/前缀/无 四套 | 统一字重，图标同尺寸同色 | 现状已达标，收敛其余 |
| 图表身份色 | `stableColorMap` 10 色 | 保持，与 cat 色明确分属两套 | 避免语义混淆 |

---

## E. 实施计划（待确认后执行，共 5 阶段）

| 阶段 | 范围 | 风险 | 验收标准 |
|---|---|---|---|
| 1. 图标语义与映射统一 | 实现名称匹配（P0-1）；新增 `transactionIcon`/固定分组语义映射；退款/平账独立图标；修正四处文案 | 低：纯前端映射，不动数据 | 选「自动」能按名称命中；退款/平账有独立图标与文案 |
| 2. 颜色与 Token 统一 | 接入 `refund`/`reconciliation` Badge tone；「不计收支」「退款全额」改用中性/业务色；清理硬编码斜纹 | 低：token 已存在，无新色 | 全仓无 `warning` 当业务色；无字面量颜色（除 token 文件） |
| 3. 图标选择器优化 | 保持 60 图标结构；接名称匹配；推荐分组微调；**不开颜色选择** | 低 | 选择器「自动」与预览一致；文案与行为一致 |
| 4. 各页面展示规范统一 | `CategoryIcon` 两档尺寸落 CSS；删除 `row` 死代码与裸 Tag 分支；统一对齐/箭头；账户展示统一 | **中**：涉及多页面，需回归 10 类场景 | 同一 iconKey 在 4 个列表场景尺寸/颜色/对齐一致 |
| 5. 浅/深主题验证 | 逐页核对 light/dark；图表色块 vs 图标约定落到 `ui-design.md`；补单测 | 低 | 10 类场景深浅两态无对比度/错位问题 |

> 阶段 1、2 可并一次提交（同属"语义与颜色统一"一件事）；阶段 4 单独提交；提交由用户决定，本报告不执行任何 git 操作。

---

## 待确认的关键决策点（进入实施前请拍板）

1. **账户图标**：保持不可配并统一展示（推荐，不改数据模型），还是新增 `iconKey` 字段（改数据模型，需单独立项）？
2. **退款/平账独立图标**：是否接受"交易类型层用专用色、分类层保留同名 key"这种**同图形不同色**的边界方案？若不接受，则需为退款分类 key 换图形。
3. **报表/Sankey**：确认保持"图表用色块、列表用图标"的既有约定（推荐，轻量），还是要求全场景都显示图标（改动大）？
4. 「自动按名称匹配」是否**必须实现**（P0-1）还是改为诚实的「通用标签」文案即可？推荐前者。

> 本报告为一次性审计交付物，实施完成后可归档或并入 `docs/ui-design.md`，不计入常驻 7 份文档体系。
