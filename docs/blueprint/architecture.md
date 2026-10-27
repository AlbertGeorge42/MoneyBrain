# 目标架构

> 这份文档回答：**长期要建成什么样的结构**。
> 它描述终局形态，因此即使某部分还没实现，也按终局写——
> 已实现部分的现状见 [architecture.md](../architecture.md)。

### 1 记账内核：生成器模型，不物化分录

**决策：保留「交易 → 有符号分录」这个模型，但不建 `postings` 表。**

- 分录由纯函数 `postingsOf(tx, ctx)` 生成，Σ = 0；余额、收支、现金流、预算、投资分析**最终**都是这组分录的投影。
- 交易表是唯一事实源；**分录不落库**。落库分录等于物化派生值，与原则 2 冲突，且引入「交易行与分录行不一致」这类致命风险（写路径必须双写）。
- 需要「一笔支出拆多个分类」或「审计级重建」时，再把分录物化——那时交易行退化为分组头，金额只存在于分录。该扩展点必须留在设计里，但今天不实现。

**口径规则必须能同时用于 SQL 与 JS（关键约束）**

背景：领域函数接收 `transactions: LedgerTransaction[]`，返回一个小数。这让 service 若想复用口径，就必须把整表读进内存——于是报表与预算绕过内核自己写了一份 SQL 汇总，同一口径出现两个答案。

因此口径拆成两层：
- **规则层**（纯数据/纯函数）：哪些交易类型计入、退款按哪种类型冲减、账户与分类如何匹配。规则层同时被领域层的纯函数与后端的 SQL `where` 消费——两边读同一份规则，不会分叉。
- **计算层**：在规则之上做聚合。**聚合在哪跑由数据量决定**（余额与统计在 SQL，余额计算走领域层的 `balanceBefore`），但口径只有一份。

**口径必须带版本**：分录生成器的规则会演进（口径调整、退款规则变化）。因此：

- 领域层维护 `ruleVersion`（口径版本号），写入每笔交易。
- 解释历史数字时，用**交易当时的版本**重算，而不是当前规则；否则改一次口径，历史报表就变了。
- 这条比物化分录更重要：它是「可解释」原则的技术前提。
- 规则按版本冻结成独立文件（`ledger/rules.v1.ts`），已发布的版本不再修改；
  新口径另建文件并登记，登记后不允许覆盖。

**属性测试**：用 `fast-check` 随机生成交易序列，断言 蓝图入口 §4 的 1–6 条内核不变量。领域层是纯函数，属性测试成本极低、收益极高。

### 2 金额与精度：整数分端到端

| 层 | 形态 |
|---|---|
| 存储 | 整数分（SQLite INTEGER / Prisma `BigInt`） |
| 领域 | `Minor`（整数分） |
| 传输 | 整数分（JSON number） |
| 前端 | `Minor`（同一个 branded number） |
| 展示 / 文件 | 只在边界除以 100 |

**上限**：SQLite 是 64 位，但 JSON number 只有 `2^53` 精确。
传输与前端以 **9e15 分（90 万亿元）** 为上限，API 校验写死这个值；超出 64 位由存储层拒绝。
个人账本远到不了，但边界必须明确，不能靠「应该不会」。

**理由**：SQLite 没有真正的 DECIMAL，Prisma 的 `Decimal` 会落到 NUMERIC 亲和性，非整数值可能以浮点存储——这正是金额系统最经典的精度陷阱。整数分从根上消除它。

**舍入策略（必须写死）**：

- 输入金额：元字符串 → 分，**按小数点做字符串解析**（`"8.11"` → `811`），不经过 `Number(x) * 100`
  （`8.115 * 100 = 811.4999…`，浮点会在分位上制造 1 分误差）。
- 输入与导入都要求最多 2 位小数；超过就报错并列出前几行，**不静默舍入**（静默舍入等于悄悄改钱）。
- 存储与计算全程整数，不出现第二次舍入。
- **历史数据迁移**是唯一的例外：旧库里的浮点尾巴（如 `8.120000000000001`）在迁移时按 half-up 取整，
  并把「被取整的行数 / 最大偏差」写进对账报告。
- 退款金额允许任意分值（如退 33.33 元），但不得超过剩余可退金额。

### 3 日期与时区

- 交易日期存为 `YYYY-MM-DD` 字符串列（`occurred_on`），不存时分秒。
- `created_at/updated_at` 是时间戳，只用于审计与排序，不参与任何金额计算。
- 期间一律半开 `[start, endExclusive)`。
- 日期的语义（本地日历日、不做 UTC 转换）见 [requirements.md](../requirements.md) 2。

### 4 数据模型（目标）

长期的数据模型要补齐的是**恢复能力**、**版本历史**与**可同步性**：

```text
ledgers(id, name, created_at)                                          ← 多账本（阶段 4 · K3）
transactions(id, ledger_id, type, amount_minor, fee_minor, coupon_minor,
             occurred_on, rule_version, rev, vv, …, deleted_at)
audit_events(id, entity, entity_id, action, before_json, after_json, at)   ← 支撑撤销与「修改历史」
tags(id, name), transaction_tags(transaction_id, tag_id)                ← 标签（阶段 4 · K2）
recurring_rules(id, ledger_id, …, next_occurrence)                      ← 周期交易（阶段 4 · K1）
savings_goals(id, ledger_id, target_minor, deadline, …)                 ← 储蓄目标（阶段 4 · K4）
attachments(id, entity, entity_id, blob_ref, …)                         ← 票据图片（阶段 4 · K5）
sync_conflicts(id, entity_type, entity_id, version_a, version_b,
               detected_at, resolved_at)                              ← 同步冲突本地表（不进容器、不参与同步）
```

要点：

- **软删除**：交易增加 `deleted_at`；所有查询默认过滤 `deleted_at IS NULL`。
  过滤必须集中在 **repository 层**，不允许各 service 各写一遍——漏一处就等于余额错一次。
- **审计事件**：所有写操作记录 before/after。撤销 = 依据审计事件反向写入，不需要额外的撤销表。
- **快照链**：继续持久化 `previous_snapshot_id` 不变（它是写入顺序的产物，不是金额派生值）；但「按日期排序推导」的规则要统一，禁止两处实现。
- **可同步字段**（F 批次落地）：所有可同步实体带 `rev`（本地修订号）与 `vv`（版本向量），
  并以客户端生成的 UUID 作主键。`vv` 存为 JSON 列即可——个人规模下设备数个位数，
  几十字节换掉「设备时钟可能偏差」这个隐患是划算的。
- **多账本**：所有业务表带 `ledger_id`，查询默认按当前账本过滤（过滤规则同样集中在 repository 层）。
- **票据图片不进主库**：只存引用与元数据，图片本体走文件存储（阶段 4 · K5），
  否则 SQLite 会被二进制撑大，备份与同步都会变慢。
- **同步容器格式与实体集合解耦**（决策 #34 / 批次 F11）：记录自带 `entityType`，
  合并算法不认识具体实体类型。这样推迟落地的实体（K1–K3）不会变成「推翻容器格式」。
- **冲突落在本地表**：不可比版本写入 `sync_conflicts`（两个版本都留存），用户解决后
  写一条 `rev = 双方较大值 + 1`、`vv = 双方逐维取最大` 的新记录——它同时支配两个旧版本，
  冲突不会在另一端复现。存储与收敛规格见 [stage-2-sync.md](stage-2-sync.md)「冲突的存储与收敛」。

### 5 分层与依赖方向

```text
apps/web      →  apps/api（HTTP）
apps/api      →  app（用例/仓储端口）、domain（纯函数）、contracts（类型）、db（Prisma repository）
apps/mobile   →  app（同一套用例）、domain、contracts、sync、SQLite repository
app           →  domain、contracts（禁止 react/express/prisma/node:fs）
sync          →  domain、contracts、crypto（禁止依赖文件系统与网盘 SDK，传输由各端适配）
domain        →  无外部依赖（禁止 react/express/prisma/node:fs）
```

移动端出现后，**共享的是用例、规则、契约与同步协议，不是数据库实现**：
桌面继续用 Prisma，手机用 SQLite 插件，各自实现 `app` 的仓储端口。
`app` 与 `sync` 只在实际做移动端/同步时创建，不提前拆。

**决策：不拆 `packages/db` / `packages/ui`。**

- 真正要防的债是「service 里直接写 Prisma 查询」和「同一个控件在多处各写一遍」，
  这两件事用**应用内分层**就能解决：`apps/api/src/db/{repositories}` 与 `apps/web/src/ui/{原语}`。
- 拆成独立 workspace 包会带来构建顺序、产物发布、类型解析的额外复杂度，而收益只在「出现第二个后端消费者 / 第二个前端应用」时才兑现。
- **复审触发条件（已部分触发）**：移动端出现时只新增 `app`（用例）与 `sync`（同步协议）两个包；
  `db` 仍只服务桌面，不把 Prisma 抽成跨端包。只有出现**第二个桌面/服务端消费者**时，才把 `db` 升为独立包。

### 6 API 契约与错误模型

**契约**：类型唯一来源是 `packages/contracts`（TypeScript 类型 + 错误码）。
后端校验用 `apps/api/src/common/validators.ts` 的手写校验器并配测试。

**决策：REST 仍不引入 zod，但同步/备份格式必须做运行时校验。**
理由：移动端不走 REST，而是共享 `app` 与 `sync` 包，因此「第二个客户端」不会让 REST 变成 contract-first 的理由；
但同步文件来自网盘、可能跨版本，是**真正的不可信输入**，必须逐条校验并拒绝整批，不能信 TypeScript 类型。

- **复审触发条件**：出现对外开放 API 或第三个远程客户端时，REST 切换为 contract-first（zod 或 ts-rest）。
- 同步格式的校验器放在 `packages/sync`，与格式版本一起测试；不允许「先部分应用，再报错」。

**错误模型**：已定型，长期不变——判别联合响应、统一错误码、`requestId` 贯通。
规则见 [dev-guide.md](../dev-guide.md) §7，此处不重复。

**分页**：保持 offset（`page` / `pageSize`）。个人账本十年内不会超过游标分页的收益区间，游标只会增加「上一页/下一页」的实现成本。
**复审触发条件**：单账户交易数超过 5 万或列表查询稳定超过 300ms 时，再评估游标或虚拟滚动。

### 7 前端结构

- **feature 切片**：`features/<domain>/{api,schema,hooks,components}`。
  - feature 之间**可以**互相引用，但只能通过对方的公开入口（`index.ts`），禁止深路径导入；跨 feature 依赖必须是有意的、少的。
  - `index.ts` 是 feature 的公开入口，属于「包公共入口」，不算违规的桶导出。
  - 页面（`routes/` / `pages/`）只做布局装配，业务逻辑下沉到 feature。
- **共享原语层** `apps/web/src/ui/`：只放真正被多处复用的原语（`MoneyText`、`DateField`、`PeriodPicker`、`DataTable`、`EmptyState`、`ErrorState`、`PageHeader`）与设计令牌。
  - **不做「包装层的包装层」**：只有当某个原语需要统一行为（金额等宽、日期格式、错误呈现）时才包；否则直接用 AntD。
- **设计系统层** `apps/web/src/styles/`：token 是一切的来源，组件不允许自带第二套。
  - **命名空间隔离**：AntD 的 CSS 变量用 `--ant-*`（由 `cssVar.prefix` 指定），
    项目自有 token 用 `--mb-*`。两者不得同名——同名后「读到谁的变量」取决于 DOM 位置，
    且切换主题时两套来源的更新时机不同（AntD 走 cssinjs 缓存，项目走 `syncCssVars()` 手动注入）。
  - **token 单一来源**：结构 token（间距/字号/圆角/动效/布局/断点）只写在
    `styles/theme/variables.css`；颜色 token（信息色/财务色/阴影）只由
    `syncCssVars()` 从 AntD 算法派生后注入。组件里出现裸值即视为违规。
  - **断点单一来源**：一份 TS 常量定义断点值，JS hook 与 CSS 媒体查询都从它派生。
    注意技术约束——CSS 自定义属性在 `@media` 条件里不生效，
    因此媒体查询里的断点需要**构建期解析**（PostCSS 插件），而不是单纯写 `var()`。
  - **引用完整性必须有守卫**：CSS 引用未定义变量不报错，浏览器静默回退。
    必须有自动化检查同时覆盖「引用未定义」与「定义了却无人引用」两个方向。

### 8 信任层（数据可信度）

这是长期价值最高、当前最缺的一层。目标能力：

| 能力 | 说明 |
|---|---|
| 撤销 | 单条删除不弹确认，改为「已删除 · 撤销」；撤销基于审计事件反向写入 |
| 修改历史 | 详情页可看这笔记录的变更历史 |
| 回收站 | 软删除的交易可查、可恢复 |
| 导入回滚点 | 覆盖导入前自动快照，可一键回退 |
| 导入预览 | 导入前显示将新增/更新/跳过多少条与冲突样例 |
| 自动定时备份 | 可选开关，到点自动导出一份 |

### 9 运行基线

| 项 | 目标 |
|---|---|
| SQLite 参数 | 开启 WAL；设置 `busy_timeout`（≥5s）；避免读写互斥导致的「database is locked」 |
| 并发写 | 单进程内写操作串行化（写队列）；前端同一时刻只允许一个写请求在飞 |
| 性能包络 | 目标规模：10 年 × 每年 500 笔 ≈ 5000 笔交易、50 个账户；全量报表与余额计算 < 200ms，列表查询 < 100ms。**列表与报表的扫描量必须随期间增长，不随总历史增长**；余额是明确例外——某日余额 = 期初 + 该日前全部流水，天然 O(历史)，在包络内可接受，禁止为此加余额缓存列。超出包络时先测量再改结构 |
| 数据自检 | `npm run db:verify`：重算全部余额与报表，用 蓝图入口 §4 的不变量交叉比对，输出差异报告（发现损坏、重复、口径漂移） |
| 日志分级 | 领域层错误不打 error 级；未知异常打 error 并带堆栈 |
